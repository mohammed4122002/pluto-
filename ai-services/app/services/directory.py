from supabase import Client

from app.services.text_match import fuzzy_contains


def find_doctors(db: Client, branch_id: str, specialty_query: str | None = None) -> list[dict]:
    """Doctors actually available at this branch right now, optionally
    narrowed to a specialty/department the patient mentioned (matched
    loosely against Arabic/English names — patients never type the exact
    DB spelling)."""
    branch_staff_ids = [
        row["staff_id"]
        for row in db.table("staff_branches").select("staff_id").eq("branch_id", branch_id).execute().data
    ]
    if not branch_staff_ids:
        return []

    rows = (
        db.table("staff")
        .select(
            "id, full_name, gender, qualification, years_experience, bio, "
            "doctor_specialties(specialties(name_ar, name_en))"
        )
        .in_("id", branch_staff_ids)
        .eq("role", "doctor")
        .eq("is_active", True)
        .eq("availability_status", "available")
        .execute()
        .data
    )

    query = (specialty_query or "").strip()
    results = []
    for row in rows:
        specialties = [
            ds["specialties"] for ds in (row.get("doctor_specialties") or []) if ds.get("specialties")
        ]
        names = [s.get("name_ar") for s in specialties] + [s.get("name_en") for s in specialties]
        if query and not any(fuzzy_contains(name, query) for name in names):
            continue
        results.append(
            {
                "id": row["id"],
                "full_name": row["full_name"],
                "gender": row.get("gender"),
                "qualification": row.get("qualification"),
                "years_experience": row.get("years_experience"),
                "specialties": [s.get("name_ar") for s in specialties if s.get("name_ar")],
            }
        )
    return results


def list_services(db: Client, branch_id: str, query: str | None = None) -> list[dict]:
    """The clinic's real service catalogue, optionally narrowed to what the
    patient asked about.

    Without this the assistant had no way to look services up at all, so it
    answered "what do you offer" from whatever it had absorbed -- confirmed
    live, it named four services when twelve were active, and never once
    mentioned the 500 JOD orthodontics fitting. Prices come from the same
    rows the booking and invoicing paths read, so a quoted price cannot
    drift from the charged one."""
    rows = (
        db.table("services")
        .select("id, name, description, price, duration_minutes, specialty_id, specialties(name_ar)")
        .eq("is_active", True)
        .is_("deleted_at", "null")
        .order("name")
        .execute()
        .data
    )

    # Branch scoping goes through the doctors who actually provide each
    # service: a service nobody at this branch performs must not be offered
    # to someone booking here.
    branch_staff_ids = {
        r["staff_id"] for r in db.table("staff_branches").select("staff_id").eq("branch_id", branch_id).execute().data
    }
    linked = db.table("service_doctors").select("service_id, staff_id").execute().data
    doctors_by_service: dict[str, set[str]] = {}
    for link in linked:
        doctors_by_service.setdefault(link["service_id"], set()).add(link["staff_id"])

    results = []
    for row in rows:
        providers = doctors_by_service.get(row["id"])
        # A service with no doctors linked at all is clinic-wide (that's how
        # the dashboard treats it too), so it stays visible everywhere.
        if providers and not (providers & branch_staff_ids):
            continue
        if query and not fuzzy_contains(row["name"], query) and not fuzzy_contains(
            (row.get("specialties") or {}).get("name_ar") or "", query
        ):
            continue
        results.append(
            {
                "name": row["name"],
                "price": row.get("price"),
                "duration_minutes": row.get("duration_minutes"),
                "specialty": (row.get("specialties") or {}).get("name_ar"),
            }
        )
    return results
