import base64
import logging

import httpx

logger = logging.getLogger(__name__)

# Gemini's native generateContent endpoint, not the OpenAI-compatible shim
# this used to go through: confirmed live, every single vision call was
# failing with "Request contains an invalid argument" (a 400 -- a malformed
# request, not a safety block, which Gemini returns as a normal 200 with
# finishReason=SAFETY) once that failure finally got logged to audit_log
# instead of being silently swallowed. The prior code sent the image as a
# remote image_url the same way OpenAI's own vision models accept, but
# Gemini's compat layer doesn't reliably fetch a remote URL server-side the
# same way -- the same gap transcription.py already hit and fixed the same
# way: download the bytes here and send them inline as base64, which is
# Gemini's own documented, reliable way to accept image input.
_GENERATE_CONTENT_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

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
    "أول كلمة بردّك، بالضبط، لازم تكون وحدة من هاي الأربع (بحروف إنجليزية كبيرة، بدون أي شي قبلها)، "
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
    "RECEIPT — لو الصورة إثبات دفع: إيصال أو فاتورة، سكرين شوت من تطبيق بنك أو محفظة إلكترونية "
    "(كليك/زين كاش/أوركاش...)، إشعار حوالة، أو صورة بوصة كاشير. العلامات: مبلغ ورقم مرجعي/عملية، "
    "تاريخ ووقت، اسم بنك أو محفظة أو متجر، كلمات متل 'تم التحويل' أو 'ناجحة' أو 'المبلغ'. بعدها ما "
    "تكتبي شي إضافي.\n\n"
    "NONE — لو الصورة مو طبية ولا تجميلية ولا إثبات دفع إطلاقاً (صورة شخصية عادية بدون أي شي ظاهر "
    "يستدعي تحليل، منتج، مستند مش واضح، صورة غير واضحة). بعدها ما تكتبي شي إضافي.\n\n"
    "مهم: لو الصورة فيها أي جزء من جسم إنسان (يد، وجه، جلد، شعر...) وعليه أي شي غير طبيعي ظاهر بالعين "
    "(احمرار، تورم، تغيّر لون، تقشّر، طفح، جرح، بقعة غريبة...) — حتى لو بسيط، حتى لو مو متأكدة شو "
    "بالضبط، حتى لو الصورة شكلها احترافية أو product photography — صنّفيها ANALYSIS أو URGENT حسب "
    "شدتها، ولا تصنّفيها NONE أبداً. NONE محجوزة بس للصور اللي فعلاً ما فيها أي جزء جسم غير طبيعي "
    "الشكل ولا هي إثبات دفع (سيلفي عادي، منتج، مستند...). الخطأ الأخطر هون إنك تفوّتي صورة فيها إصابة "
    "أو مشكلة حقيقية وتصنّفيها NONE — مش إنك تحللي صورة سليمة بالغلط.\n\n"
    "وبنفس الوقت، ممنوع تخلطي بين الاتنين بالاتجاه التاني: صورة فيها ورق أو شاشة فيها أرقام ومبالغ "
    "وما فيها ولا جزء من جسم إنسان هي RECEIPT (أو NONE لو مش واضحة إنها دفع)، وممنوع تحلليها كأنها "
    "حالة جلدية. القرار الأول اللي لازم تاخديه: في بالصورة جزء من جسم إنسان أو لأ؟ إذا في → URGENT "
    "أو ANALYSIS. إذا ما في → RECEIPT أو NONE."
)


def describe_patient_photo(api_key: str, model: str, image_url: str) -> tuple[str | None, str | None, str | None]:
    """Classifies and (for "urgent"/"analysis") describes a photo a patient
    sent, for the booking assistant to relay and act on.

    Downloads the image itself and sends it inline (base64 + mime type) to
    Gemini's generateContent endpoint, rather than handing Gemini a remote
    URL to fetch — see the module comment above for why.

    Returns (kind, text, failure_reason).

    - ("urgent" | "analysis", text, None) on a successful classification.
    - ("receipt", None, None) when it's proof of payment (a receipt, an
      invoice, a bank/wallet transfer screenshot). Its own class rather
      than a flavour of "none": the two need opposite handling — a receipt
      goes straight to submit_payment_receipt, while "none" means we don't
      know what the patient sent and have to ask.
    - (None, None, None) when Gemini explicitly classified the photo as
      "none" (an unrelated selfie, a product, an unclear photo) -- a real,
      positive classification, not a failure.
    - (None, None, failure_reason) when the call itself failed (download
      error, provider error, an empty response) — kept distinguishable
      from a genuine "none" classification on purpose, so a failure reads
      as "unknown" rather than "confirmed not medical" (see
      _photo_description_for_turn in chat.py, which is what actually acts
      on this distinction).
    """
    try:
        image_response = httpx.get(image_url, timeout=20)
        image_response.raise_for_status()
        image_bytes = image_response.content
        mime_type = (image_response.headers.get("content-type") or "image/jpeg").split(";")[0].strip()
    except Exception as exc:
        logger.exception("failed to download patient photo from %s", image_url)
        return None, None, f"image download failed: {exc}"

    try:
        response = httpx.post(
            _GENERATE_CONTENT_URL.format(model=model),
            params={"key": api_key},
            json={
                "systemInstruction": {"parts": [{"text": _VISION_SYSTEM_PROMPT}]},
                "contents": [
                    {
                        "parts": [
                            {
                                "inline_data": {
                                    "mime_type": mime_type or "image/jpeg",
                                    "data": base64.b64encode(image_bytes).decode("ascii"),
                                }
                            }
                        ]
                    }
                ],
                "generationConfig": {"maxOutputTokens": 280, "temperature": 0.2},
            },
            timeout=30,
        )
        response.raise_for_status()
        data = response.json()
        text = (data["candidates"][0]["content"]["parts"][0]["text"] or "").strip()
    except Exception as exc:
        logger.exception("photo description call failed for image_url=%s", image_url)
        return None, None, f"vision call failed: {exc}"
    if not text:
        return None, None, "empty response from vision model"

    first_line, _, rest = text.partition("\n")
    marker = first_line.strip().upper().strip(".:، ")
    body = rest.strip()

    if marker == "NONE":
        return None, None, None
    if marker == "RECEIPT":
        # No body text: the receipt's own contents are matched against the
        # pending payment by submit_payment_receipt, not by anything the
        # vision model reads off it.
        return "receipt", None, None
    if marker == "URGENT":
        return "urgent", body or text, None
    if marker == "ANALYSIS":
        return "analysis", body or text, None
    # No recognizable marker (a model that ignored the format) -- treat the
    # whole reply as a plain, non-urgent description rather than dropping a
    # real analysis on the floor over a formatting slip.
    return "analysis", text, None
