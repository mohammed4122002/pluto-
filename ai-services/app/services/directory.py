from supabase import Client


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

    query = (specialty_query or "").strip().lower()
    results = []
    for row in rows:
        specialties = [
            ds["specialties"] for ds in (row.get("doctor_specialties") or []) if ds.get("specialties")
        ]
        names = [s.get("name_ar") for s in specialties] + [s.get("name_en") for s in specialties]
        if query and not any(query in (name or "").lower() for name in names):
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
