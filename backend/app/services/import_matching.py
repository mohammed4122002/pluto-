"""Auto-suggests a column mapping for an arbitrary source header row —
tolerant of Arabic, English, or mixed naming. Unmatched source columns are
left unmapped (ignored, never an error); the caller decides whether any
*required* target field ended up with nothing mapped to it."""

import difflib

from app.services.import_fields import FIELD_DEFINITIONS


def _normalize(text: str) -> str:
    return str(text).strip().lower().replace("_", " ").replace("-", " ")


def _strip_al(word: str) -> str:
    # Arabic definite article "ال" makes otherwise-identical words look
    # unrelated to naive matching (جوال vs الجوال، بريد vs البريد...).
    return word[2:] if word.startswith("ال") and len(word) > 3 else word


def _tokens(text: str) -> set[str]:
    return {_strip_al(w) for w in _normalize(text).split() if w}


def suggest_mapping(data_type: str, source_columns: list[str]) -> dict[str, str | None]:
    fields = FIELD_DEFINITIONS[data_type]
    candidates: dict[str, str] = {}
    for field_name, definition in fields.items():
        candidates[_normalize(field_name)] = field_name
        for syn in definition["synonyms"]:
            candidates[_normalize(syn)] = field_name

    mapping: dict[str, str | None] = {}
    used_fields: set[str] = set()

    for col in source_columns:
        norm = _normalize(col)
        if not norm:
            mapping[col] = None
            continue

        if norm in candidates and candidates[norm] not in used_fields:
            mapping[col] = candidates[norm]
            used_fields.add(candidates[norm])
            continue

        col_tokens = _tokens(col)
        best_field, best_score = None, 0.0
        for cand_text, field_name in candidates.items():
            if field_name in used_fields:
                continue
            # A shared meaningful word (e.g. "جوال" in both "جوال المريض" and
            # "الجوال") is a much stronger signal than raw character overlap
            # once extra descriptive words are involved.
            if col_tokens & _tokens(cand_text):
                score = 0.9
            else:
                score = difflib.SequenceMatcher(None, norm, cand_text).ratio()
            if score > best_score:
                best_field, best_score = field_name, score

        if best_field and best_score >= 0.72:
            mapping[col] = best_field
            used_fields.add(best_field)
        else:
            mapping[col] = None

    return mapping


def missing_required_fields(data_type: str, mapping: dict[str, str | None]) -> list[str]:
    fields = FIELD_DEFINITIONS[data_type]
    mapped_targets = {v for v in mapping.values() if v}
    return [name for name, definition in fields.items() if definition["required"] and name not in mapped_targets]
