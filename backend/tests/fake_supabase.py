"""A minimal stand-in for the Supabase client, enough to exercise scoping.

Only the query surface the scoping code actually uses is implemented — select,
eq/in_/is_, limit, order, execute. Filters are applied in Python over
in-memory rows, so a test reads as "here are the rows, here is what the caller
should be able to see" rather than as a pile of mocks.
"""

from types import SimpleNamespace


class _Query:
    def __init__(self, rows: list[dict]):
        # A shallow copy of the list, but the dicts themselves are shared with
        # the table -- an update through one query is visible to the next,
        # which is what makes a write-then-read assertion mean anything.
        self._rows = list(rows)
        self._pending_update: dict | None = None
        self._pending_delete = False

    def select(self, *_columns):
        return self

    def order(self, *_args, **_kwargs):
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

    def is_(self, column: str, value: str):
        if value == "null":
            self._rows = [r for r in self._rows if r.get(column) is None]
        return self

    def gte(self, column: str, value):
        self._rows = [r for r in self._rows if r.get(column) is not None and r[column] >= value]
        return self

    def lt(self, column: str, value):
        self._rows = [r for r in self._rows if r.get(column) is not None and r[column] < value]
        return self

    def insert(self, rows):
        self.inserted = rows if isinstance(rows, list) else [rows]
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
        if self._pending_update is not None:
            for row in self._rows:
                row.update(self._pending_update)
        elif self._pending_delete:
            for row in self._rows:
                row["__deleted__"] = True
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
        query = _Query(self._tables.get(name, []))
        original_insert = query.insert

        def insert(rows):
            self.inserts.setdefault(name, []).extend(rows if isinstance(rows, list) else [rows])
            return original_insert(rows)

        query.insert = insert
        return query
