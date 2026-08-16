from supabase import Client

from app.services.money import tidy_amount
from app.services.text_match import fuzzy_contains


def list_active_branches(db: Client) -> list[dict]:
    """Every active branch of this clinic, clinic-wide -- not scoped to any
    one branch, since its whole purpose is letting the assistant ask "which
    location?" for a clinic with more than one. A single-branch clinic (most
    of them) never has a reason to call this; _build_system_prompt only
    offers it to the model when there's actually a choice to make."""
    rows = (
        db.table("branches")
        .select("id, name, address, working_hours_note")
        .eq("is_active", True)
        .order("name")
        .execute()
        .data
    )
    return [
        {
            "id": r["id"],
            "name": r["name"],
            "address": r.get("address"),
            "working_hours_note": r.get("working_hours_note"),
        }
        for r in rows
    ]


def resolve_branch_id_by_name(db: Client, branch_name: str) -> str | None:
    """Loose match against an active branch's name -- mirrors booking.py's
    _resolve_doctor_id, same reason: the model has to name what it's picking
    from list_active_branches' own results, not a literal id it would have
    to carry across turns."""
    query = (branch_name or "").strip()
    if not query:
        return None
    rows = db.table("branches").select("id, name").eq("is_active", True).execute().data
    for row in rows:
        if fuzzy_contains(row["name"], query) or fuzzy_contains(query, row["name"]):
            return row["id"]
    return None


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

    branch_row = db.table("branches").select("currency").eq("id", branch_id).limit(1).execute().data
    currency = (branch_row[0].get("currency") if branch_row else None) or ""

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
                # Postgres numeric arrives as a float, so a 25 JOD consultation
                # was quoted to patients as "25.0 JOD". Whole prices lose the
                # decimal; a genuine 25.5 keeps it.
                "price": tidy_amount(row.get("price")),
                # A bare number left the assistant to supply a unit, and it
                # guessed: a Jordanian clinic's prices came back quoted in
                # "جنيه". The booking path already reads this same column.
                "currency": currency,
                "duration_minutes": row.get("duration_minutes"),
                "specialty": (row.get("specialties") or {}).get("name_ar"),
            }
        )
    return results
