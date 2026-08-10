import re

# Arabic combining diacritics (tashkeel): fathatan/dammatan/kasratan/fatha/
# damma/kasra/shadda/sukun (U+064B-U+065F) plus superscript alef (U+0670).
_TASHKEEL_RE = re.compile("[ً-ٰٟ]")
_LETTER_MAP = str.maketrans(
    {
        "أ": "ا",  # أ -> ا
        "إ": "ا",  # إ -> ا
        "آ": "ا",  # آ -> ا
        "ٱ": "ا",  # ٱ -> ا
        "ى": "ي",  # ى -> ي
        "ة": "ه",  # ة -> ه
    }
)


def normalize_arabic(text: str) -> str:
    """Patients (and the model itself, when it writes a name back in a
    reply) don't reliably reproduce the exact hamza/alef/taa-marbuta form
    stored in the database — "ايلا" vs "إيلا" are different Unicode
    characters that plain ILIKE never matches. Fold both sides to the same
    normalized form before comparing."""
    return _TASHKEEL_RE.sub("", text).translate(_LETTER_MAP).strip().lower()


def fuzzy_contains(haystack: str | None, needle: str) -> bool:
    if not haystack:
        return False
    return normalize_arabic(needle) in normalize_arabic(haystack)


# Arabic-Indic (٠-٩) and Eastern Arabic-Indic (۰-۹) digits, which patients type
# as readily as ASCII ones.
_DIGIT_MAP = str.maketrans("٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹", "01234567890123456789")


def to_ascii_digits(text: str) -> str:
    """The same text with ٠-٩ / ۰-۹ rewritten as 0-9, everything else as it
    was. Not a reformatting of the number -- "٠٧٩" and "079" are the same
    digits written in two scripts, and a record holding the first cannot be
    dialled, deduped or matched against the second."""
    return (text or "").translate(_DIGIT_MAP)


def digits_only(text: str | None) -> str:
    """Every digit in the text, in order, with separators dropped.

    A phone is the same phone whether it was typed "0791234567",
    "079 123 4567", "٠٧٩١٢٣٤٥٦٧" or "+962 79 123 4567", so comparing what the
    patient wrote against what the assistant is trying to save has to happen
    on digits alone."""
    if not text:
        return ""
    return "".join(ch for ch in text.translate(_DIGIT_MAP) if ch.isdigit())
