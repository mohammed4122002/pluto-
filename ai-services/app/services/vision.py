import logging

from openai import OpenAI

logger = logging.getLogger(__name__)

# Deliberately not a diagnosis, and not allowed to become one. This model's
# only job is to hand the booking assistant a neutral visual description it
# can use to suggest which service might fit -- the same way it would use a
# patient's own words ("عندي حبوب بوجهي"). BASE_INSTRUCTIONS in chat.py
# repeats the "never diagnose" rule on the booking-assistant side too, since
# a system prompt only constrains the model it's attached to.
_VISION_SYSTEM_PROMPT = (
    "إنتِ تصفين صورة أرسلها مريض لعيادة، بهدف وحيد: مساعدة موظفة استقبال آلية تقترح عليه أنسب خدمة من "
    "قائمة خدمات العيادة. لستِ طبيبة ولا يحق لك تشخيص أي حالة أو تسمية أي مرض أو حالة جلدية/طبية باسمها "
    "الطبي. صفي فقط الشكل الظاهري اللي بتشوفيه، بجملة أو جملتين بالعربي ومحايدة تماماً (مثال: 'صورة وجه "
    "فيها احمرار وحبوب صغيرة متفرقة على الخدين'، أو 'صورة يد فيها انتفاخ خفيف عند المفصل'). ممنوع نهائياً "
    "أي كلمة تشخيصية أو اسم مرض (حب الشباب، إكزيما، التهاب، كسر، صدفية...) — وصف الشكل فقط، مش الحالة. "
    "لو الصورة مو طبية أو تجميلية إطلاقاً (إيصال دفع، صورة شخصية عادية بدون أي شي ظاهر يستدعي وصف، صورة "
    "غير واضحة)، ردّي بالضبط بكلمة 'none' بدون أي إضافة."
)


def describe_patient_photo(client: OpenAI, model: str, image_url: str) -> str | None:
    """A short, deliberately non-diagnostic visual description of a photo a
    patient sent — for the booking assistant to use when suggesting which
    service might fit, never as a diagnosis. Returns None on any failure or
    when the photo isn't something a service suggestion could be based on
    (a payment receipt, an unrelated selfie, ...) — the calling turn must
    proceed as a normal text-only reply either way, never blocked by this.
    """
    try:
        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": _VISION_SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": [{"type": "image_url", "image_url": {"url": image_url}}],
                },
            ],
            max_tokens=120,
            temperature=0.2,
        )
        text = (response.choices[0].message.content or "").strip()
    except Exception:
        logger.exception("photo description call failed for image_url=%s", image_url)
        return None
    if not text or text.lower().strip(".، ") == "none":
        return None
    return text
