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
