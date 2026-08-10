"""Reading a SQL Server connection string the way a clinic actually supplies it.

Most existing clinic systems run on SQL Server, so this is the connector that
decides whether a handover is an afternoon or a week. The IT person on the
other side hands over whatever their system shows them -- usually the .NET
keyword form, sometimes a URL, sometimes just host and database -- so all of
those have to land on the same connection rather than "تعذر الاتصال".
"""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.services.import_connectors import _parse_mssql_connection  # noqa: E402


def test_the_dotnet_keyword_form():
    parsed = _parse_mssql_connection(
        "Server=10.0.0.5,1433;Database=ClinicDB;User Id=sa;Password=Str0ng!Pass;"
    )
    assert parsed == {
        "server": "10.0.0.5",
        "port": 1433,
        "database": "ClinicDB",
        "user": "sa",
        "password": "Str0ng!Pass",
    }


def test_the_keyword_form_without_an_explicit_port():
    parsed = _parse_mssql_connection("Server=clinic-sql;Database=ClinicDB;User Id=sa;Password=x")
    assert parsed["server"] == "clinic-sql"
    assert parsed["port"] == 1433


def test_the_sql_management_studio_wording():
    # SSMS shows "Data Source" / "Initial Catalog" rather than Server/Database.
    parsed = _parse_mssql_connection(
        "Data Source=10.0.0.5,1444;Initial Catalog=Clinic;User Id=reader;Password=p"
    )
    assert parsed["server"] == "10.0.0.5"
    assert parsed["port"] == 1444
    assert parsed["database"] == "Clinic"
    assert parsed["user"] == "reader"


def test_the_url_form():
    parsed = _parse_mssql_connection("mssql://reader:secret@10.0.0.5:1433/ClinicDB")
    assert parsed == {
        "server": "10.0.0.5",
        "port": 1433,
        "database": "ClinicDB",
        "user": "reader",
        "password": "secret",
    }


def test_a_password_with_url_characters_survives_the_url_form():
    # A password containing @ or / is ordinary and must not be mangled.
    parsed = _parse_mssql_connection("mssql://sa:p%40ss%2Fword@host:1433/db")
    assert parsed["password"] == "p@ss/word"
    assert parsed["server"] == "host"


def test_bare_host_and_database():
    parsed = _parse_mssql_connection("10.0.0.5:1433/ClinicDB")
    assert parsed["server"] == "10.0.0.5"
    assert parsed["port"] == 1433
    assert parsed["database"] == "ClinicDB"


def test_uid_pwd_abbreviations():
    parsed = _parse_mssql_connection("Server=host;Database=db;UID=sa;PWD=secret")
    assert parsed["user"] == "sa"
    assert parsed["password"] == "secret"


def test_an_empty_string_is_rejected_clearly():
    with pytest.raises(ValueError):
        _parse_mssql_connection("   ")


# --- Query construction ---------------------------------------------------
# The connection itself needs a real server, so these pin the parts that are
# pure logic: which table names are allowed through, and the SQL built for the
# one that is. Everything else is exercised the first time a clinic connects.

from unittest.mock import patch  # noqa: E402


class _FakeCursor:
    def __init__(self, tables):
        self._tables = tables
        self.executed: list[str] = []
        self.description = [("id",), ("name",)]

    def execute(self, sql, *_):
        self.executed.append(sql)

    def fetchall(self):
        if "INFORMATION_SCHEMA" in self.executed[-1]:
            return [(t,) for t in self._tables]
        return [(1, "أحمد")]


class _FakeConn:
    def __init__(self, tables):
        self.cursor_obj = _FakeCursor(tables)

    def cursor(self):
        return self.cursor_obj

    def close(self):
        pass


def _with_tables(tables):
    return patch("app.services.import_connectors._mssql_connect", side_effect=lambda _cs: _FakeConn(tables))


def test_reading_a_table_returns_rows_keyed_by_column():
    from app.services.import_connectors import sqlserver_read_table

    with _with_tables(["dbo.Patients"]):
        columns, rows = sqlserver_read_table("Server=h;Database=d;UID=u;PWD=p", "dbo.Patients")
    assert columns == ["id", "name"]
    assert rows == [{"id": 1, "name": "أحمد"}]


def test_a_table_name_not_in_the_catalogue_is_refused():
    # The only defence against a crafted table name is that it must have come
    # back from INFORMATION_SCHEMA first.
    from app.services.import_connectors import sqlserver_read_table

    with _with_tables(["dbo.Patients"]):
        with pytest.raises(ValueError):
            sqlserver_read_table("Server=h;Database=d;UID=u;PWD=p", "dbo.Users; drop table Patients--")


def test_the_limit_reaches_the_sql_as_a_number_and_the_name_is_bracketed():
    # TOP takes a literal, not a bind parameter, so the limit is the one value
    # interpolated into the statement -- it has to be an int, never text.
    from app.services import import_connectors as ic

    captured = {}

    def fake_connect(_cs):
        conn = _FakeConn(["dbo.Patients"])
        captured["conn"] = conn
        return conn

    with patch.object(ic, "_mssql_connect", side_effect=fake_connect):
        ic.sqlserver_read_table("Server=h;Database=d;UID=u;PWD=p", "dbo.Patients", limit=50)

    select = [sql for sql in captured["conn"].cursor_obj.executed if "INFORMATION_SCHEMA" not in sql][0]
    assert "select top 50 " in select
    assert "[dbo].[Patients]" in select


def test_views_are_listed_too():
    # Clinic systems commonly expose reporting data as views, not base tables.
    from app.services.import_connectors import sqlserver_list_tables

    with _with_tables(["dbo.Patients", "rpt.VisitsView"]):
        assert sqlserver_list_tables("Server=h;Database=d;UID=u;PWD=p") == ["dbo.Patients", "rpt.VisitsView"]
