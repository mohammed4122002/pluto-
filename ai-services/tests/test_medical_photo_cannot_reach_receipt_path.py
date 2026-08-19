"""A photo classified as medical (analysis/urgent) must never be treated as
a payment receipt, even with unrelated payment/complaint context sitting
earlier in the same conversation.

Live: a patient filed a complaint two weeks earlier ("شكوى عن سوء
المعاملة"), came back, said "هلا", got a reply that resumed the complaint
thread, then sent a photo of an infant's rash. The photo was classified and
stored correctly ("تحليل مرئي آلي (analysis): طفح جلدي بسيط المظهر ..."),
but the actual reply was entirely about a receipt: "معلش الإيصال اللي
بعتته مش مرتبط بدفعة حالياً أو مش ظاهر عنا ... بخصوص الشكوى والدفعات". The
model had called submit_payment_receipt on its own initiative -- nothing in
the analysis branch instructs that -- almost certainly anchored on the
older complaint/payment context still in view, and answered from that
tool's result instead of the analysis-card instructions actually written
for this branch.

Two layers, matching the pattern that already held for the medical
escalation fix (PR #55): a prompt line is not enough once the model has
reason to reach for a tool anyway, so the tool itself is removed from what
the model can call this turn.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.routers.chat import TOOLS, _build_system_prompt, _select_tools  # noqa: E402
from tests.test_qa_photo_and_dialect_gaps import _PromptDb, _TWO_BRANCHES  # noqa: E402


def _tool_names(tools):
    return {t["function"]["name"] for t in tools}


# --- tool removal -------------------------------------------------------


def test_submit_payment_receipt_is_removed_for_an_analysed_photo():
    tools = _select_tools({}, photo_kind="analysis")
    assert "submit_payment_receipt" not in _tool_names(tools)


def test_submit_payment_receipt_is_removed_for_an_urgent_photo():
    tools = _select_tools({}, photo_kind="urgent")
    assert "submit_payment_receipt" not in _tool_names(tools)


def test_submit_payment_receipt_stays_available_for_a_genuine_receipt_photo():
    tools = _select_tools({}, photo_kind="receipt")
    assert "submit_payment_receipt" in _tool_names(tools)


def test_submit_payment_receipt_stays_available_when_no_photo_was_sent():
    tools = _select_tools({}, photo_kind=None)
    assert "submit_payment_receipt" in _tool_names(tools)


def test_other_tools_are_unaffected_by_the_photo_kind_filter():
    assert _tool_names(_select_tools({}, photo_kind="analysis")) == _tool_names(TOOLS) - {"submit_payment_receipt"}


def test_inquiry_only_mode_and_an_analysed_photo_compose_correctly():
    # Both restrictions apply together: booking tools stay gone (inquiry_only)
    # and the receipt tool goes too (analysed photo).
    tools = _select_tools({"ai_mode": "inquiry_only"}, photo_kind="analysis")
    names = _tool_names(tools)
    assert "book_appointment" not in names
    assert "submit_payment_receipt" not in names
    assert "list_services" in names


def test_greeting_only_mode_stays_empty_regardless_of_photo_kind():
    assert _select_tools({"ai_mode": "greeting_only"}, photo_kind="analysis") == []


# --- prompt-level guard (defense in depth) -------------------------------


def _photo_prompt(kind, description="النوع: طفح جلدي بسيط"):
    return _build_system_prompt(
        _PromptDb(_TWO_BRANCHES),
        "b1",
        {},
        patient_id=None,
        photo_description=description,
        branch_selected_explicitly=True,
        photo_kind=kind,
    )


def test_the_prompt_also_forbids_the_receipt_tool_by_name_for_medical_photos():
    for kind in ("analysis", "urgent"):
        prompt = _photo_prompt(kind)
        assert "ممنوع نهائياً تستدعي submit_payment_receipt" in prompt, kind


def test_the_prompt_says_not_to_blend_in_an_older_unrelated_thread():
    # The exact failure mode: an old complaint sitting in history bled into
    # the reply to a new, unrelated photo.
    prompt = _photo_prompt("analysis")
    assert "لا تخلطيه بتحليل الصورة" in prompt
