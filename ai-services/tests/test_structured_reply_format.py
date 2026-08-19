"""BASE_INSTRUCTIONS used to explicitly ban numbered/bulleted lists and
formatted "cards" everywhere ("this is what an automated system writes, a
real receptionist doesn't") in favor of sounding like a casual human typing
a chat message. Deliberately reversed across the whole bot: structured,
emoji-consistent cards for information-dense replies (times, services,
doctors, booking confirmations, photo analysis) read as more professional
and are easier for a patient to scan than one long run-on sentence.

This pins that the reversal actually happened and didn't leave the old ban
sitting alongside the new instructions, contradicting them.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.routers.chat import BASE_INSTRUCTIONS  # noqa: E402


def test_the_old_ban_on_lists_and_cards_is_gone():
    assert "ممنوع نهائياً قوائم مرقّمة أو نقطية" not in BASE_INSTRUCTIONS
    assert "هاي صيغة نظام آلي وحدا موظفة استقبال حقيقية بتكتبها بشات" not in BASE_INSTRUCTIONS


def test_structured_card_formatting_is_now_required():
    assert "*كارت*" in BASE_INSTRUCTIONS
    assert "**بولد**" in BASE_INSTRUCTIONS


def test_a_consistent_emoji_vocabulary_is_defined():
    for emoji in ["📅", "🕐", "💰", "📍", "🎫", "📋", "⚠️"]:
        assert emoji in BASE_INSTRUCTIONS


def test_available_times_are_still_shown_in_full_just_now_as_a_card():
    # The underlying safety rule (never hide open slots) must survive the
    # formatting change untouched.
    assert "كل الأوقات" in BASE_INSTRUCTIONS
    assert "📅" in BASE_INSTRUCTIONS


def test_booking_confirmation_uses_the_details_card_format():
    assert "تفاصيل موعدك" in BASE_INSTRUCTIONS
    assert "🎫 رقم الحجز" in BASE_INSTRUCTIONS


def test_slangy_nicknames_are_banned():
    # Live: the bot opened an emergency reply to a patient who had just sent
    # a photo of a burned hand with "يا فنان" -- street-slang address that
    # reads as flippant exactly when the patient is most worried.
    from app.routers.chat import BASE_INSTRUCTIONS

    assert "يا فنان" in BASE_INSTRUCTIONS
    assert "ممنوع الألقاب" in BASE_INSTRUCTIONS


def test_verbatim_repetition_across_turns_is_called_out():
    # The single clearest bot-tell, and the thing patients notice first.
    from app.routers.chat import BASE_INSTRUCTIONS

    assert "ولا تكرري نفس الجملة الجاهزة بكل رد" in BASE_INSTRUCTIONS


def test_empty_tool_results_may_not_be_explained_away():
    # Live: an empty slot search became "this service isn't available at
    # the Zarqa branch" -- which was false, and sent the patient elsewhere.
    from app.routers.chat import BASE_INSTRUCTIONS

    assert "ممنوع منعاً باتاً تفسّري نتيجة فاضية من أي أداة بسبب من عندك" in BASE_INSTRUCTIONS
    assert "service_not_available_at_branch" in BASE_INSTRUCTIONS
