"""A minimal stand-in for the Supabase client, enough to exercise scoping.

Only the query surface the scoping code actually uses is implemented — select,
eq/in_/is_, limit, order, execute. Filters are applied in Python over
in-memory rows, so a test reads as "here are the rows, here is what the caller
should be able to see" rather than as a pile of mocks.
"""

from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import uuid4


class _Query:
    def __init__(self, rows: list[dict], backing: list[dict] | None = None):
        # A shallow copy of the list, but the dicts themselves are shared with
        # the table -- an update through one query is visible to the next,
        # which is what makes a write-then-read assertion mean anything.
        self._rows = list(rows)
        # The real, persistent table list -- insert() appends here so a
        # later .table(name) call (a fresh _Query with its own _rows copy)
        # sees the new row too, not just this one.
        self._backing = backing if backing is not None else rows
        self._pending_update: dict | None = None
        self._pending_delete = False
        self._pending_insert: list[dict] | None = None
        self._single = False

    def select(self, *_columns):
        return self

    def single(self):
        # Real supabase-py returns .data as one dict, not a list -- callers
        # like GET /conversations/{id} do `row.pop("channels")` straight off
        # the result, which a list has no such method for.
        self._single = True
        return self

    def order(self, column: str, desc: bool = False, **_kwargs):
        # None-safe: a row missing the sort column shouldn't crash the
        # comparison, just sort as if it were the smallest value.
        self._rows = sorted(self._rows, key=lambda r: (r.get(column) is None, r.get(column)), reverse=desc)
        return self

    def limit(self, n: int):
        self._rows = self._rows[:n]
        return self

    def eq(self, column: str, value):
        self._rows = [r for r in self._rows if r.get(column) == value]
        return self

    def in_(self, column: str, values):
        allowed = set(values)
        self._rows = [r for r in self._rows if r.get(column) in allowed]
        return self

    def neq(self, column: str, value):
        self._rows = [r for r in self._rows if r.get(column) != value]
        return self

    def or_(self, _filter_string: str):
        """Accepted but not applied -- parsing PostgREST's or-filter grammar
        ("branch_id.eq.x,branch_id.is.null") into Python predicates is a
        chunk of work no current test needs. Tests using this must assert on
        something other than which rows the or-filter would have excluded;
        put only rows that should survive it in the fixture."""
        return self

    def is_(self, column: str, value: str):
        if value == "null":
            self._rows = [r for r in self._rows if r.get(column) is None]
        return self

    def gte(self, column: str, value):
        self._rows = [r for r in self._rows if r.get(column) is not None and r[column] >= value]
        return self

    def gt(self, column: str, value):
        self._rows = [r for r in self._rows if r.get(column) is not None and r[column] > value]
        return self

    def lt(self, column: str, value):
        self._rows = [r for r in self._rows if r.get(column) is not None and r[column] < value]
        return self

    def insert(self, rows):
        self.inserted = rows if isinstance(rows, list) else [rows]
        self._pending_insert = self.inserted
        return self

    def update(self, values: dict):
        # supabase-py puts the verb before the filters
        # (.update({...}).eq("id", x)), so the change is recorded here and
        # applied to whatever survives filtering at execute() time.
        self._pending_update = values
        return self

    def delete(self):
        self._pending_delete = True
        return self

    def execute(self):
        if self._pending_insert is not None:
            # Mirrors real Supabase: insert().execute().data is the row(s)
            # just created (with a stand-in id if the caller didn't supply
            # one), and they become visible to whatever queries this table
            # next -- an insert-then-read in the same test means something.
            for row in self._pending_insert:
                row.setdefault("id", str(uuid4()))
                row.setdefault("created_at", datetime.now(timezone.utc).isoformat())
            self._backing.extend(self._pending_insert)
            return SimpleNamespace(data=self._pending_insert)
        if self._pending_update is not None:
            for row in self._rows:
                row.update(self._pending_update)
        elif self._pending_delete:
            # Actually drop the rows from the table. Stamping a flag instead
            # made every delete invisible to the next read, so a router that
            # failed to delete looked identical to one that worked.
            doomed = {id(row) for row in self._rows}
            self._backing[:] = [row for row in self._backing if id(row) not in doomed]
        if self._single:
            return SimpleNamespace(data=self._rows[0] if self._rows else None)
        return SimpleNamespace(data=self._rows)


class FakeSupabase:
    """`tables` maps table name -> list of row dicts. Inserts are recorded on
    `.inserts` so a test can assert on what a call *wrote*, not just read.

    Rows are shared, not copied, so an update through one query is visible to
    the next — which is what makes a create-then-read assertion mean anything.
    """

    def __init__(self, tables: dict[str, list[dict]]):
        self._tables = tables
        self.inserts: dict[str, list[dict]] = {}
        self.rpc_results: dict[str, list[dict]] = {}
        self.rpc_calls: list[tuple[str, dict]] = []

    def rpc(self, name: str, params: dict):
        """Postgres functions are the one thing this double can't emulate --
        `patients_for_staff` is 40 lines of SQL. Tests register the rows a call
        should return; what's asserted is that the router passes the right
        arguments and shapes the response, which is the part in Python.
        """
        self.rpc_calls.append((name, params))
        return _Query(self.rpc_results.get(name, []))

    def table(self, name: str):
        backing = self._tables.setdefault(name, [])
        query = _Query(backing, backing)
        original_insert = query.insert

        def insert(rows):
            self.inserts.setdefault(name, []).extend(rows if isinstance(rows, list) else [rows])
            return original_insert(rows)

        query.insert = insert
        return query
