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
