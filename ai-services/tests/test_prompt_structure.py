"""The system prompt's shape, not its wording.

BASE_INSTRUCTIONS grew one rule at a time, each added to fix a live
incident, and ended up with the safety-critical booking rules scattered
across three distant sections -- which is how a "call book_appointment
directly" instruction survived for months a few lines away from a rule
forbidding exactly that. Grouping is what stops that recurring, so it is
worth asserting on directly.

These tests deliberately check placement and uniqueness rather than
phrasing: rewording a rule is fine and expected, moving a safety rule back
into the style section or letting a near-duplicate creep back in is not.
"""

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.routers.chat import BASE_INSTRUCTIONS as B  # noqa: E402

RED_LINES = "⛔ خطوط حمراء"
FLOW = "مسار الحجز — بهذا الترتيب"
CANCEL = "الإلغاء والتعديل:"
MONEY = "الباقات والكوبونات والدفع:"
STYLE = "أسلوبك ولغتك:"
SCOPE = "حدود شغلك"
ESCALATION = "قواعد التصعيد"
SURVEY = "استبيان الرضا"

SECTIONS = [RED_LINES, FLOW, CANCEL, MONEY, STYLE, SCOPE, ESCALATION, SURVEY]


def test_every_section_exists_exactly_once():
    for header in SECTIONS:
        assert B.count(header) == 1, f"section header missing or duplicated: {header}"


def test_sections_appear_in_priority_order():
    positions = [B.index(h) for h in SECTIONS]
    assert positions == sorted(positions), (
        "sections are out of order; the safety-critical ones must come first: "
        f"{[(h, B.index(h)) for h in SECTIONS]}"
    )


def test_the_red_lines_come_before_anything_about_tone():
    assert B.index(RED_LINES) < B.index(STYLE)


def _section_of(needle):
    """Which section a given rule text sits in."""
    at = B.index(needle)
    current = None
    for header in SECTIONS:
        if B.index(header) < at:
            current = header
    return current


# Each of these was added in response to a real incident; each belongs with
# the rules that stop the same class of harm, not filed under presentation.
CRITICAL = {
    "ممنوع نهائياً قول 'تم الحجز'": RED_LINES,
    "ممنوع منعاً باتاً تفسّري نتيجة فاضية": RED_LINES,
    "ممنوع نهائياً ذكر اسم طبيب أو تخصص من عندك": RED_LINES,
    "ممنوع نهائياً اختراع أو تخمين رقم هاتف": RED_LINES,
    "الاسم لازم يكون **ثلاثي**": RED_LINES,
    "هي شاطرة؟": FLOW,
    "موافقة عامة على 'بدك تحجزي؟'": FLOW,
    "ترتيب الحجز الصح": FLOW,
    "سبب الإلغاء": CANCEL,
}


def test_critical_rules_live_in_a_safety_section():
    for rule, expected in CRITICAL.items():
        assert rule in B, f"rule text vanished from the prompt: {rule}"
        assert _section_of(rule) == expected, (
            f"rule moved out of its safety section: {rule!r} is now under {_section_of(rule)!r}, "
            f"expected {expected!r}"
        )


def test_no_rule_is_repeated_verbatim():
    rules = [ln.strip() for ln in B.split("\n") if ln.strip().startswith("- ")]
    seen, dupes = set(), []
    for r in rules:
        if r in seen:
            dupes.append(r[:80])
        seen.add(r)
    assert not dupes, f"duplicated rules: {dupes}"


def test_no_two_rules_share_a_long_opening(  ):
    """Near-duplicates -- two rules opening with the same 45 characters are
    almost always the same instruction stated twice, which is how the prompt
    accumulated contradictions in the first place."""
    rules = [ln.strip() for ln in B.split("\n") if ln.strip().startswith("- ")]
    openings = {}
    for r in rules:
        key = re.sub(r"\s+", " ", r[2:47])
        openings.setdefault(key, []).append(r[:70])
    clashes = {k: v for k, v in openings.items() if len(v) > 1}
    assert not clashes, f"near-duplicate rules: {clashes}"


def test_the_prompt_has_not_ballooned():
    """A guard rail, not a target. Instruction-following degrades as the
    prompt grows, and it grows by one well-meaning rule at a time -- this
    turns that drift into a visible failure rather than a slow decline."""
    assert len(B) < 26000, (
        f"BASE_INSTRUCTIONS is {len(B)} chars. Before adding more, check whether an existing "
        "rule already covers it -- and whether the new rule contradicts one."
    )
