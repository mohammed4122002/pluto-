import logging

from openai import OpenAI

logger = logging.getLogger(__name__)

# Classifies a patient's photo into one of three lanes, on purpose, rather
# than always producing the same kind of output:
#
# - "urgent": looks like something that needs real, prompt medical attention
#   (a deep/large burn, heavy bleeding, an obvious deformity, a
#   badly-swollen/infected-looking wound). The booking assistant's job here
#   is to say so plainly and push toward urgent care / escalation -- never a
#   calm "here are matching services" card, which would read as the clinic
#   treating an emergency as routine business.
# - "analysis": a visible, non-emergency concern worth a structured read --
#   skin (acne, pigmentation, enlarged pores, dryness/oiliness, dark
#   circles, mild wrinkles/scarring), hair (hair loss, dandruff, thinning),
#   or a minor burn/wound/rash that doesn't look urgent. Named with common,
#   non-alarming terms and an approximate severity, always paired with an
#   explicit "this is indicative, not a diagnosis" framing downstream.
# - "none": not medical/cosmetic at all (a payment receipt, a plain selfie,
#   an unclear photo) -- unchanged from before.
#
# The model still never claims a real diagnosis in either "urgent" or
# "analysis" mode; the difference from a plain description is being allowed
# to name common, low-stakes concerns by their everyday name (the same way a
# patient would describe themselves: "عندي حبوب" not "primary inflammatory
# acne vulgaris"), which patients and clinics alike expect from this kind of
# feature -- BASE_INSTRUCTIONS in chat.py still repeats the
# never-a-real-diagnosis rule on the booking-assistant side, since a system
# prompt only constrains the model it's attached to.
_VISION_SYSTEM_PROMPT = (
    "إنتِ تحلّلين صورة أرسلها مريض لعيادة، لمساعدة مساعدة حجز آلية تقترح عليه أنسب خدمة وتشجعه يحجز — "
    "مش تشخيص طبي نهائي أو رأي طبيب بأي شكل من الأشكال.\n\n"
    "أول كلمة بردّك، بالضبط، لازم تكون وحدة من هاي الثلاث (بحروف إنجليزية كبيرة، بدون أي شي قبلها)، "
    "وبعدها سطر جديد فيه التفاصيل:\n\n"
    "URGENT — لو الصورة تبيّن شي بيحتاج عناية طبية عاجلة فعلاً: حرق كبير أو عميق المظهر، نزيف واضح، "
    "تشوّه أو انتفاخ شديد ومقلق، جرح يبدو ملتهب أو متقيّح بشكل واضح. بعدها اكتبي وصف شكلي محايد بجملة "
    "أو جملتين بس (بدون اسم حالة أو تشخيص)، مثال: 'صورة يد فيها احمرار وتقشّر واسع يمتد لعدة أصابع، "
    "المظهر يوحي بحرق واسع النطاق'.\n\n"
    "ANALYSIS — لو الصورة تبيّن مسألة ظاهرة مش طارئة: بشرة (حب شباب، تصبغات أو بقع، مسام واسعة، جفاف "
    "أو دهنية زايدة، هالات سوداء، تجاعيد أو ترهل خفيف، ندبات خفيفة)، شعر (تساقط، قشرة، ترقّق)، أو حرق/جرح/"
    "طفح جلدي بسيط المظهر ومش مقلق. اكتبي تحليل قصير منظم بالعربي بالضبط بهذا الشكل (احذفي أي سطر "
    "معلومته مش واضحة من الصورة):\n"
    "النوع: [تصنيف تقريبي مناسب لنوع الصورة — مثلاً 'بشرة دهنية/مختلطة' أو 'بداية تساقط شعر' أو 'حرق "
    "سطحي محدود']\n"
    "الحالة العامة: [وصف قصير جداً]\n"
    "ملاحظات:\n"
    "- [ملاحظة] ([خفيفة/متوسطة])\n"
    "- ...\n"
    "استخدمي بس مصطلحات شائعة غير مقلقة طبياً متل الأمثلة فوق — ممنوع نهائياً اسم مرض جلدي طبي حقيقي "
    "(إكزيما، صدفية، فطريات، التهاب بكتيري...) أو درجة حرق طبية رسمية (درجة أولى/تانية/تالتة) أو أي "
    "كلام يوحي بتشخيص فعلي. هاي ملاحظات شكلية تقريبية بس، مش تشخيص — ولو في أي شك إنه المستوى أخطر من "
    "'متوسطة'، صنّفيها URGENT بدل هيك.\n\n"
    "NONE — لو الصورة مو طبية ولا تجميلية إطلاقاً (إيصال دفع، صورة شخصية عادية بدون أي شي ظاهر يستدعي "
    "تحليل، صورة غير واضحة). بعدها ما تكتبي شي إضافي."
)


def describe_patient_photo(client: OpenAI, model: str, image_url: str) -> tuple[str, str] | None:
    """Classifies and (for "urgent"/"analysis") describes a photo a patient
    sent, for the booking assistant to relay and act on. Returns None on any
    failure or when the photo is classified "none" (a payment receipt, an
    unrelated selfie, ...) — the calling turn must proceed as a normal
    text-only reply either way, never blocked by this. Otherwise returns
    (kind, text) where kind is "urgent" or "analysis" — see
    _VISION_SYSTEM_PROMPT for what each means and how the caller should
    treat it differently.
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
            max_tokens=280,
            temperature=0.2,
        )
        text = (response.choices[0].message.content or "").strip()
    except Exception:
        logger.exception("photo description call failed for image_url=%s", image_url)
        return None
    if not text:
        return None

    first_line, _, rest = text.partition("\n")
    marker = first_line.strip().upper().strip(".:، ")
    body = rest.strip()

    if marker == "NONE":
        return None
    if marker == "URGENT":
        return ("urgent", body or text)
    if marker == "ANALYSIS":
        return ("analysis", body or text)
    # No recognizable marker (a model that ignored the format) -- treat the
    # whole reply as a plain, non-urgent description rather than dropping a
    # real analysis on the floor over a formatting slip.
    return ("analysis", text)
