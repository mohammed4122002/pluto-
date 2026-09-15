"""Confirmed live 2026-09-15: vision.py classified a real acne photo
successfully (kind="analysis", a real structured card), _build_system_prompt
injected it exactly as designed -- but the reply actually sent to the patient
was a generic "I can't open your photos, please describe your issue in
writing" apology that never touched the analysis at all. OpenAI (which never
sees the image itself, only ai-services' own text description of it) has a
strong trained reflex to disclaim image access that apparently overrides an
explicit instruction not to.

_reply_falsely_claims_it_cannot_see_the_photo is the detector generate_reply
uses to catch this and retry once -- tested here in isolation since the full
retry path lives inside a FastAPI endpoint with heavy DB/OpenAI wiring.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.routers.chat import _reply_falsely_claims_it_cannot_see_the_photo  # noqa: E402


def test_the_exact_live_incident_reply_is_caught():
    reply = (
        "أهلاً، شايف إني عم بستلم منك صور بس مش عم بقدر أفتحها أو أقرأ تفاصيلها من عندي، "
        "فلو سمحت اكتبلي شو المشكلة أو شو الأعراض اللي عندك بالظبط عشان أقدر أساعدك."
    )
    assert _reply_falsely_claims_it_cannot_see_the_photo(reply) is True


def test_a_real_analysis_card_reply_is_not_a_false_positive():
    reply = (
        "🔹 *النوع:* بشرة دهنية مع ظهور حبوب\n"
        "🔹 *الحالة العامة:* انتشار حبوب بارزة واحمرار\n"
        "📋 *الملاحظات:*\n"
        "• حبوب حمراء وبارزة (متوسطة)\n"
        "✨ *خدمات مناسبة لك:* جلسة تنظيف بشرة\n"
        "تحليل أولي استرشادي مش تشخيص طبي دقيق"
    )
    assert _reply_falsely_claims_it_cannot_see_the_photo(reply) is False


def test_a_normal_text_reply_with_no_photo_is_not_a_false_positive():
    assert _reply_falsely_claims_it_cannot_see_the_photo("أهلين! تفضل شو بقدر أساعدك فيه؟") is False


def test_an_english_refusal_is_also_caught():
    assert _reply_falsely_claims_it_cannot_see_the_photo("Sorry, I can't view images sent here.") is True


def test_empty_reply_is_not_a_false_positive():
    assert _reply_falsely_claims_it_cannot_see_the_photo("") is False
    assert _reply_falsely_claims_it_cannot_see_the_photo(None) is False
