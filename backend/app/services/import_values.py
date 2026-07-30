"""Value parsing helpers for the import engine: Arabic-Indic numerals,
ambiguous D/M date detection (never guess — ask), and an approximate
tabular Hijri-to-Gregorian conversion (no external dependency; may differ
by up to a day from the observational Umm al-Qura calendar, which is
disclosed in the UI rather than presented as exact)."""

import re
from datetime import date, datetime

_ARABIC_DIGITS = str.maketrans("٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹", "01234567890123456789")

_DATE_SEP_RE = re.compile(r"^\s*(\d{1,4})[/\-.](\d{1,2})[/\-.](\d{1,4})\s*(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?\s*$")


def normalize_digits(value: str) -> str:
    return value.translate(_ARABIC_DIGITS)


class AmbiguousDateError(Exception):
    """Raised instead of guessing when a date like 03/05/2026 could
    reasonably be either D/M/Y or M/D/Y."""

    def __init__(self, raw: str):
        self.raw = raw
        super().__init__(f"تاريخ غامض: {raw}")


def looks_like_hijri_year(year: int) -> bool:
    # A Hijri year in this plausible clinic-data range corresponds to
    # roughly 1882-2076 CE — implausible as a literal Gregorian year for a
    # real patient/staff record, so it's a strong signal the sheet is Hijri.
    return 1300 <= year <= 1500


def hijri_to_gregorian(year: int, month: int, day: int) -> date:
    """Tabular (civil) Hijri -> Gregorian conversion via Julian Day Number."""
    jdn = (11 * year + 3) // 30 + 354 * year + 30 * month - (month - 1) // 2 + day + 1948440 - 385
    ell = jdn + 68569
    n = (4 * ell) // 146097
    ell = ell - (146097 * n + 3) // 4
    i = (4000 * (ell + 1)) // 1461001
    ell = ell - (1461 * i) // 4 + 31
    j = (80 * ell) // 2447
    d = ell - (2447 * j) // 80
    ell = j // 11
    m = j + 2 - 12 * ell
    y = 100 * (n - 49) + i + ell
    return date(y, m, d)


def parse_date_or_datetime(
    raw, day_first: bool | None = None, assume_hijri: bool = False
) -> tuple[datetime | date | None, bool, bool]:
    """Returns (parsed_value, is_ambiguous, looks_hijri).

    If already a real date/datetime object (openpyxl parses Excel dates
    natively), it's returned as-is. If a string is ambiguous and no
    `day_first` preference was given, is_ambiguous=True and the value is
    None — the caller must ask the user, never guess.
    """
    if isinstance(raw, (datetime, date)):
        return raw, False, False
    if raw is None:
        return None, False, False

    text = normalize_digits(str(raw).strip())
    if not text:
        return None, False, False

    try:
        iso = text.replace("Z", "+00:00")
        return (datetime.fromisoformat(iso) if "T" in iso or " " in iso.strip() and ":" in iso else date.fromisoformat(iso)), False, False
    except ValueError:
        pass

    match = _DATE_SEP_RE.match(text)
    if not match:
        return None, False, False

    a, b, c, hh, mm, ss = match.groups()
    a, b, c = int(a), int(b), int(c)

    # Figure out which of a/c is the 4-digit year.
    if len(str(a)) == 4:
        year, p1, p2 = a, b, c
    else:
        year, p1, p2 = c, a, b

    hijri = assume_hijri or looks_like_hijri_year(year)

    p1_could_be_month = 1 <= p1 <= 12
    p2_could_be_month = 1 <= p2 <= 12
    ambiguous = p1_could_be_month and p2_could_be_month and p1 != p2 and day_first is None

    if ambiguous:
        return None, True, hijri

    if not p1_could_be_month:
        day, month = p1, p2
    elif not p2_could_be_month:
        month, day = p1, p2
    elif day_first:
        day, month = p1, p2
    else:
        month, day = p1, p2

    try:
        the_date = hijri_to_gregorian(year, month, day) if hijri else date(year, month, day)
    except ValueError:
        return None, False, hijri

    if hh:
        return datetime(the_date.year, the_date.month, the_date.day, int(hh), int(mm), int(ss or 0)), False, hijri
    return the_date, False, hijri
