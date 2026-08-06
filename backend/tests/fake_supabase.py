"""A minimal stand-in for the Supabase client, enough to exercise scoping.

Only the query surface the scoping code actually uses is implemented — select,
eq/in_/is_, limit, order, execute. Filters are applied in Python over
in-memory rows, so a test reads as "here are the rows, here is what the caller
should be able to see" rather than as a pile of mocks.
"""

from types import SimpleNamespace


class _Query:
    def __init__(self, rows: list[dict]):
        self._rows = list(rows)

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

    def execute(self):
        return SimpleNamespace(data=self._rows)


class FakeSupabase:
    """`tables` maps table name -> list of row dicts. Inserts are recorded on
    `.inserts` so a test can assert on what a call *wrote*, not just read."""

    def __init__(self, tables: dict[str, list[dict]]):
        self._tables = tables
        self.inserts: dict[str, list[dict]] = {}

    def table(self, name: str):
        query = _Query(self._tables.get(name, []))
        original_insert = query.insert

        def insert(rows):
            self.inserts.setdefault(name, []).extend(rows if isinstance(rows, list) else [rows])
            return original_insert(rows)

        query.insert = insert
        return query
