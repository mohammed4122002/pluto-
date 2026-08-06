"""Who owns which records — the one place that answers that question.

Self-scoping used to be a handful of ad-hoc ``if current.role == "doctor"``
checks spread across routers, and one of them sat *inside* a branch-scope
branch: a doctor whose grant was clinic-wide (which is exactly what
``sync_legacy_role`` hands out when nobody picks a branch) skipped the check
entirely and could read every patient in the clinic.

Routing every self-scope decision through :class:`StaffScope` makes that class
of bug structural rather than incidental — adding a self-scoped role is one
line in ``SELF_SCOPED_ROLES`` instead of an audit of every router.
"""

import logging

from fastapi import Depends
from supabase import Client

from app.core.auth import CurrentStaff, get_current_staff
from app.core.database import get_supabase

logger = logging.getLogger(__name__)

# Roles whose grants mean "my own records", never "every record in my branch".
# A doctor with a clinic-wide patient.view grant is still "their own patients
# only" — the branch scope widens which branches they may touch, it never
# widens *whose* records they are.
SELF_SCOPED_ROLES = {"doctor"}


class StaffScope:
    """Resolves the concrete record sets a staff member owns.

    Construction is free — every accessor queries on first use and memoizes,
    so a request that never asks about patients never pays for that query.
    """

    def __init__(self, db: Client, current: CurrentStaff):
        self._db = db
        self.current = current
        self._branch_ids: list[str] | None = None
        self._patient_ids: set[str] | None = None

    @property
    def staff_id(self) -> str:
        return self.current.id

    @property
    def is_self_scoped(self) -> bool:
        return self.current.role in SELF_SCOPED_ROLES

    def branch_ids(self) -> list[str]:
        """The branches this staff member actually works at.

        ``staff_branches`` is the intended source of truth, but staff created
        before branch assignment was mandatory have no rows there. Falling back
        to the branches their own slots and appointments already live in keeps
        their workspace usable instead of handing them an empty branch picker
        and no calendar.
        """
        if self._branch_ids is not None:
            return self._branch_ids

        rows = self._db.table("staff_branches").select("branch_id").eq("staff_id", self.staff_id).execute().data
        ids = {r["branch_id"] for r in rows}

        if not ids:
            for table in ("appointments", "slots"):
                column = "staff_id" if table == "appointments" else "doctor_id"
                found = self._db.table(table).select("branch_id").eq(column, self.staff_id).execute().data
                ids |= {r["branch_id"] for r in found if r["branch_id"]}
            if ids:
                logger.info(
                    "staff_id=%s has no staff_branches rows; derived %d branch(es) from their own records",
                    self.staff_id,
                    len(ids),
                )

        self._branch_ids = sorted(ids)
        return self._branch_ids

    def own_patient_ids(self) -> set[str]:
        """Patients this staff member has ever been booked with.

        Appointments are the link — a doctor "has" a patient because they saw
        them, not because the patient belongs to their branch (patients are
        shared across branches by design, see ``_patient_ids_visible_in_branches``).
        """
        if self._patient_ids is not None:
            return self._patient_ids
        rows = (
            self._db.table("appointments")
            .select("patient_id")
            .eq("staff_id", self.staff_id)
            .is_("deleted_at", "null")
            .execute()
            .data
        )
        self._patient_ids = {r["patient_id"] for r in rows}
        return self._patient_ids

    def narrow_patient_ids(self, visible_ids: set[str] | None) -> set[str] | None:
        """Intersect a branch-derived patient set with this staff member's own.

        ``None`` means "no restriction yet". Self-scoped roles always come back
        with a concrete set, whether or not a branch restriction applied — that
        is the invariant the old inline check failed to hold.
        """
        if not self.is_self_scoped:
            return visible_ids
        own = self.own_patient_ids()
        return own if visible_ids is None else visible_ids & own

    def owns_queue(self, queue_id: str) -> bool:
        rows = self._db.table("queues").select("doctor_id").eq("id", queue_id).limit(1).execute().data
        return bool(rows) and rows[0]["doctor_id"] == self.staff_id

    def owns_ticket(self, ticket_id: str) -> bool:
        rows = (
            self._db.table("queue_tickets").select("queues(doctor_id)").eq("id", ticket_id).limit(1).execute().data
        )
        return bool(rows) and (rows[0].get("queues") or {}).get("doctor_id") == self.staff_id

    def can_manage_own_ticket(self, ticket_id: str) -> bool:
        """Advancing a ticket in *your own* queue is inherent to having one.

        ``queue.manage`` stays the permission for driving *anyone's* queue —
        that is reception's and the nurse's job. A doctor holds only
        ``queue.view``, yet "call the next patient / started / finished" is the
        doctor's own act on their own queue, so ownership substitutes for the
        clinic-wide grant here and nowhere else.
        """
        return self.current.has_permission("queue.manage") or self.owns_ticket(ticket_id)


def get_staff_scope(
    current: CurrentStaff = Depends(get_current_staff), db: Client = Depends(get_supabase)
) -> StaffScope:
    """FastAPI dependency. Shares the cached ``get_current_staff`` resolution,
    so pairing it with ``require_permission(...)`` costs no extra auth work."""
    return StaffScope(db, current)
