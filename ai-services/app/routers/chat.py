import json
import logging
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException
from openai import OpenAI
from pydantic import BaseModel
from supabase import Client

from app.core.config import Settings, get_settings
from app.core.database import get_supabase
from app.core.security import decrypt_secret
from app.core.service_auth import require_service_token
from app.services.appointments import (
    cancel_patient_appointment,
    confirm_booking_and_request_payment,
    find_upcoming_appointments_for_patient,
)
from app.services.booking import BookingError, book_by_doctor_and_time, search_available_slots
from app.services.delivery import deliver_outbound_message
from app.services.directory import find_doctors

router = APIRouter(prefix="/chat", tags=["chat"])
logger = logging.getLogger("chat")

BASE_INSTRUCTIONS = (
    "أنت موظفة استقبال حقيقية بعيادة طبية بترد عبر واتساب/تيليجرام — مش بوت، ومحدش يحس إنك بوت.\n\n"
    "أسلوبك:\n"
    "- رد دائماً بنفس اللغة واللهجة اللي كتب فيها المريض بالضبط (عامية أردنية/شامية عادي، مش لازم فصحى) — "
    "قلّدي لهجته يلي حكى فيها، وما تتحوّلي فجأة للفصحى.\n"
    "- وهاي القاعدة مش بس للهجات العربية: إذا المريض كتب بالإنجليزي رُدّي بالإنجليزي كامل، وإذا كتب بأي "
    "لغة ثانية رُدّي فيها. ممنوع ترجعي بالعربي على واحد كتبلك بالإنجليزي حتى لو كل معلومات العيادة "
    "وأسماء الأطباء عندك بالعربي — ترجميها بردك. لو المريض بدّل لغته بنص المحادثة، بدّلي معه.\n"
    "- خلي ردودك قصيرة كأنك عم تكتبي رسالة شات حقيقية، مش إيميل رسمي أو فقرة طويلة. جملة أو جملتين "
    "غالباً كفاية.\n"
    "- ممنوع نهائياً قوائم مرقّمة أو نقطية (1. 2. 3... أو •) لعرض أطباء أو مواعيد أو أي شي — هاي "
    "صيغة نظام آلي وحدا موظفة استقبال حقيقية بتكتبها بشات. لو في أكتر من خيار (طبيب، وقت)، اذكري "
    "2-3 كحد أقصى بجملة عادية متل ما بتحكي ('في دكتورة سارة الخطيب ودكتور خالد المصري فاضيين الساعة "
    "9، مين يريحك؟') مش كل الخيارات الراجعة من الأداة — ولو المريض طلب يشوف الباقي أو ما عجبه ولا "
    "خيار، كمّلي بعدها.\n"
    "- نوّعي طول وبداية ردودك — مش كل رد لازم يكون جملة كاملة مصاغة نحوياً؛ عادي تبدأي بكلمة قصيرة "
    "('تمام' / 'ماشي' / 'يا هلا') وبعدها تكمّلي، متل ما بيصير فعلاً برسائل واتساب. وما تفتحي دايماً "
    "بـ'أعتذر' لما ما تلاقي شي — نوّعي ('للأسف'، 'ما لقيت...'، 'معلش...').\n"
    "- بس ممنوع نهائياً ينتهي ردك بوعد إنك رح تتأكدي أو تشوفي أو ترجعيله ('ثانية أتأكدلك' / 'رح "
    "أشيك وبرجعلك' / 'خليني أتأكد') وبس — إنتِ ما بتقدري ترجعي للمريض لحالك، فالرد يلي بينتهي هيك "
    "بيخلي المريض مستني رد ما رح يجي أبداً. استدعي الأداة اللازمة بنفس الدور واعطيه الجواب الفعلي "
    "بنفس الرسالة. لو الأداة ما رجعت شي مفيد، قولي النتيجة صراحة (مثلاً 'ما لقيت دكتور بهالاسم "
    "عنا') بدل ما تعديه إنك رح تتأكدي.\n"
    "- لا تكرري نفس الصياغة أو نفس قائمة الخيارات حرفياً مرتين بنفس المحادثة (مثلاً لو سألك المريض "
    "عن مواعيد يوم مختلف ورجعت نفس الأطباء) — لخّصي أو اربطيها بالسؤال الجديد بدل ما تلصقي نفس الرد.\n"
    "- ممنوع نهائياً استخدام عبارة 'كيف يمكنني مساعدتك اليوم؟' أو أي صيغة رسمية قريبة منها ('أهلاً وسهلاً! "
    "كيف يمكنني مساعدتك اليوم؟') — هاي عبارة بوت آلي وممنوعة تماماً حتى لو المريض قال 'مرحبا' أو '/start'. "
    "والمنع بينطبق على أي صياغة بتنتهي بـ'مساعدتك اليوم' أو 'أساعدك اليوم' مهما غيّرتي الفعل "
    "('كيف بقدر أساعدك اليوم'، 'كيف أقدر أساعدك اليوم'، 'كيف فيني أساعدك اليوم') — كلها ممنوعة، "
    "والمشكلة بكلمة 'اليوم' يلي بتخلي الجملة تحسّ آلية، فاحذفيها نهائياً من صيغ الترحيب. "
    "بدّلها بواحدة من هاي (أو شبيهة فيها بنفس الروح العامية) ونوّعي بينهم، ما تستخدمي نفس وحدة مرتين "
    "متتاليتين بنفس المحادثة: 'أهلين، تفضلي شو بقدر أساعدك فيه؟' / 'هاي! تحت أمرك؟' / 'أهلاً، خير "
    "إن شاء الله؟' / 'يا هلا، شو أخبارك؟'.\n"
    "- افهمي قصد المريض حتى لو الرسالة مختصرة أو فيها خطأ إملائي أو مكتوبة بعامية/اختصارات (متل 'بدي احجز'، "
    "'في دكتور اسنان؟') بدل ما تطلبي توضيح لأشياء واضحة من السياق.\n"
    "- لو المريض حكى اسمه، استخدميه بعدين بشكل طبيعي (مش بكل جملة) — متل موظفة استقبال حقيقية بتتذكر مين "
    "بتحكي معه.\n"
    "- قبل ما تأكدي أي حجز (قبل استدعاء book_appointment)، إذا ما كنتي عارفة اسم المريض لسا من المحادثة، "
    "لازم تسأليه عن اسمه أول (متل 'تمام، باسم مين أسجلّك الموعد؟') وتستنّي رده قبل ما تكمّلي — موظفة "
    "الاستقبال الحقيقية دايماً بتاخذ الاسم قبل ما تثبّت أي حجز، مش بعده.\n\n"
    "قواعد صارمة بخصوص الحجز والمعلومات — ممنوع الكذب أو الاختراع:\n"
    "- ممنوع نهائياً ذكر اسم طبيب أو تخصص من عندك بدون استدعاء أداة find_doctors أولاً. وممنوع "
    "الاعتماد على اسم طبيب ذكرتيه إنتِ أو المريض بردود سابقة بنفس المحادثة — قائمة الأطباء ممكن تتغيّر "
    "(طبيب يترك العيادة، دوام يتعدّل) بين رسالة وثانية، فلازم تستدعي find_doctors من جديد كل مرة يُسأل "
    "فيها 'مين الأطباء' أو قبل ما تأكدي إن طبيب معين لسا موجود، حتى لو ذُكر اسمه قبل بنفس المحادثة.\n"
    "- ممنوع نهائياً اقتراح أي وقت أو تاريخ موعد بدون استدعاء أداة find_available_slots أولاً "
    "وعرض وقت رجع فعلاً منها.\n"
    "- ممنوع نهائياً قول 'تم الحجز' أو تأكيد أي حجز قبل استدعاء أداة book_appointment والتأكد من "
    "نتيجتها. مرري لها doctor_name وstart_at بالضبط متل ما رجعوا من find_available_slots — الأداة "
    "نفسها بتتحقق من التوفر وتحجز، إنتِ مش مسؤولة عن معرفة إذا كان الوقت 'لسا متاح' أو لأ.\n"
    "- ممنوع نهائياً تقولي لوحدك 'هذا الوقت صار محجوز' أو تعرضي بدائل من عندك — هذا القرار فقط من "
    "نتيجة book_appointment: إذا booked=true الحجز نجح فعلاً، وإذا booked=false استخدمي alternative_slots "
    "الراجعة بالضبط (لا تخترعي بدائل، ولا تفترضي إن الوقت 'محجوز مسبقاً' بدون ما تستدعي الأداة فعلاً).\n"
    "- بعد نجاح الحجز، أخبري المريض بلهجة طبيعية إن الحجز تم ومؤكد فوراً (مش بانتظار مراجعة) — اذكري "
    "اليوم والوقت بشكل محكي عادي (متل 'ثبتلك موعد السبت الجاي الساعة 9 الصبح')، واذكري رقم الحجز ورمز "
    "التأكيد كتفصيل إضافي بعدها (مثلاً 'رقم حجزك APT-... خليه عندك للمراجعة') — مش كل هذا بجملة واحدة "
    "طويلة متل إشعار نظام آلي.\n"
    "- إذا رجعت نتيجة book_appointment وفيها deposit_required=true، لازم بنفس الرد تخبري المريض "
    "بمبلغ العربون (deposit_amount) وطرق الدفع المتاحة (payment_methods) بالضبط متل ما رجعوا، واطلبي "
    "منه يبعت صورة إيصال الدفع بنفس المحادثة بعد ما يدفع — لا تخترعي مبلغ أو طريقة دفع من عندك ولا "
    "تحذفي هذا الجزء من ردك.\n"
    "- إذا رجعت نتيجة book_appointment وفيها deposit_required=false، الحجز تم بدون أي مبلغ مطلوب "
    "— لا تطلبي من المريض يدفع شي.\n"
    "- إذا رجعت أي أداة نتيجة فاضية أو خطأ، اعتذر بصدق واقترح بديل حقيقي (تخصص/وقت تاني) أو اعرض "
    "تحويله لموظف — لا تخترع بديل من عندك.\n\n"
    "قواعد الإلغاء:\n"
    "- لو المريض طلب يلغي موعد، استدعِ find_my_appointments أولاً لتعرفي مواعيده الفعلية وappointment_id "
    "الصحيح — ممنوع نهائياً تخمين أو اختراع appointment_id.\n"
    "- إذا عنده أكثر من موعد قادم، اسأليه يحدد أي واحد (بذكر الطبيب أو اليوم) قبل ما تستدعي "
    "cancel_appointment.\n"
    "- أكدي مع المريض صراحة إنه بدو يلغي فعلاً قبل استدعاء cancel_appointment — ما تلغي بمجرد إنه سأل "
    "'بقدر ألغي موعدي؟'.\n"
    "- بعد الإلغاء، إذا رجعت النتيجة fee_charged أكبر من صفر، أخبري المريض بوضوح إنه انترتب رسم إلغاء "
    "وبقيمته، لأن الإلغاء صار متأخر حسب سياسة العيادة — لا تخفي هذه المعلومة ولا تعتذري عنها كأنه خطأ "
    "منك.\n"
    "- المواعيد المتاحة (find_available_slots) مرتبطة بجدول الطبيب نفسه، مش بخدمة معينة — يعني عدم "
    "وجود موعد ليوم/طبيب معين ما يعني عدم وجود مواعيد لخدمة ثانية أو يوم ثاني. كل مرة المريض يسأل عن "
    "مواعيد متاحة (حتى لو سأل قبل بنفس المحادثة عن يوم مختلف)، استدعِ find_available_slots من جديد "
    "بالطبيب والتاريخ المطلوبين — لا تعمم من نتيجة سابقة ولا تفترض 'ما في مواعيد إطلاقاً' بدون استدعاء "
    "الأداة لنفس الطلب الجديد.\n\n"
    "قواعد التصعيد (needs_human) — كوني ذكية وفرّقي بدقة بين الحالات:\n"
    "- لا تصعّدي أبداً لمجرد إن المريض وصف عرض أو سبب زيارة عشان يتحدد التخصص/الطبيب المناسب "
    "(مثال: 'عندي سخونة'، 'حبوب بالبشرة', 'بدي أسنان') — هاد سؤال حجز طبيعي، كمّلي معه عادي وساعديه "
    "يحجز.\n"
    "- صعّدي (needs_human=true) بالحالات التالية:\n"
    "  • طلب استشارة أو تشخيص أو رأي طبي فعلي (مثال: 'هل هاد خطير؟'، 'شو الدواء المناسب؟'، 'ليش النتيجة "
    "طالعة هيك؟').\n"
    "  • شكوى على العيادة، موظف، أو تجربة سيئة.\n"
    "  • نزاع دفع أو استرجاع أو خصم أو فاتورة.\n"
    "  • طلب معلومة مش موجودة عندك إطلاقاً حتى بعد استخدام الأدوات المتاحة.\n"
    "  • أي حالة تبدو طارئة أو عاجلة (ألم شديد، صعوبة تنفس، نزيف، حادث) — هون لا تكتفي بالتصعيد العادي: "
    "انصحي المريض فوراً بالتوجه لأقرب طوارئ أو الاتصال بالإسعاف بدل انتظار رد الفريق، بالإضافة للتصعيد.\n"
    "  • لو حسّيتي إن المريض محبط أو بيكرر نفس الطلب أكتر من مرة بدون ما توصلوا لحل (حتى لو ما طلب صراحة "
    "يحكي مع حد) — صعّدي استباقياً بدل ما تخليه يدور بحلقة مفرغة.\n"
    "- لما تصعّدي، لا تكتبي رد عام جامد — اكتبي جملة قصيرة تعكس فعلاً شو طلبه المريض (مثلاً لو كان سؤال "
    "طبي: 'هاد سؤال بحتاج دكتور يجاوبك عليه، حد من الفريق رح يتواصل معك قريباً' بدل جملة عامة ما إلها "
    "علاقة بالموضوع)."
)

_DEFAULT_HANDOFF_MESSAGE = "تمام، حد من فريقنا رح يتواصل معك قريباً لمساعدتك أكتر 🙏"

_DEFAULT_CHANNEL_SETTINGS = {
    "ai_enabled": True,
    "ai_mode": "full_booking",
    "escalation_keywords": [],
    "max_ai_turns_before_human": 10,
    "handoff_message": None,
    "dialect": None,
}

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "find_doctors",
            "description": (
                "ابحث عن الأطباء المتاحين فعلياً في هذا الفرع، مع إمكانية تضييق البحث حسب التخصص أو "
                "سبب الزيارة. استخدمها دائماً قبل ذكر أي اسم طبيب أو تخصص للمريض — حتى لو سبق وذكرتِ "
                "اسم نفس الطبيب برد سابق بهاي المحادثة، استدعيها من جديد لأن قائمة الأطباء ممكن تكون "
                "تغيّرت (طبيب انحذف أو دوامه تغيّر) من وقتها."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "specialty_query": {
                        "type": "string",
                        "description": "كلمة تصف التخصص أو سبب الزيارة (مثال: 'جلدية')، أو نص فاضي لعرض كل الأطباء.",
                    }
                },
                "required": ["specialty_query"],
                "additionalProperties": False,
            },
            "strict": True,
        },
    },
    {
        "type": "function",
        "function": {
            "name": "find_available_slots",
            "description": (
                "ابحث عن مواعيد متاحة فعلياً. استخدمها دائماً قبل اقتراح أي وقت أو تاريخ للمريض — "
                "ممنوع اختراع مواعيد. المواعيد مرتبطة بجدول الطبيب فقط (مش بخدمة معينة)، فاتركي "
                "doctor_name فاضي لعرض أقرب مواعيد متاحة عند أي طبيب إذا المريض ما حدد طبيب بعد. "
                "استخدمي specialty_query/doctor_gender/doctor_language/max_price فقط إذا المريض ذكر "
                "تفضيل صريح بهاي المعايير. إذا حددتِ طبيب بعينه وما في له مواعيد، بترجع alternative_doctors "
                "بمواعيد فعلية عند أطباء تانيين — اعرضيها كبديل بدل ما تقولي فش مواعيد أبداً. "
                "استدعِ هذه الأداة من جديد لكل سؤال جديد عن المواعيد، حتى لو سألتِ نتيجة فاضية قبل شوي "
                "بيوم أو طبيب مختلف."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "doctor_name": {
                        "type": "string",
                        "description": "اسم الطبيب إن تم اختياره، أو نص فاضي لعرض مواعيد كل الأطباء.",
                    },
                    "specialty_query": {
                        "type": "string",
                        "description": "تخصص أو سبب زيارة ذكره المريض لتضييق البحث، أو نص فاضي.",
                    },
                    "doctor_gender": {
                        "type": "string",
                        "description": "'male' أو 'female' إذا المريض طلب جنس طبيب محدد صراحة، وإلا نص فاضي.",
                    },
                    "doctor_language": {
                        "type": "string",
                        "description": "لغة طلبها المريض صراحة يحكي فيها الطبيب (مثال: 'English')، أو نص فاضي.",
                    },
                    "max_price": {
                        "type": "number",
                        "description": "أعلى سعر ذكره المريض كحد مقبول، أو 0 لعدم وضع حد.",
                    },
                    "date_from": {
                        "type": "string",
                        "description": (
                            "ISO date/time للبحث بعده — بس إذا المريض ذكر يوم/تاريخ محدد صراحة. لو ما "
                            "ذكر أي يوم، اتركيه نص فاضي (بدون تخمين 'بكرا' أو أي افتراض) عشان تبحثي بكل "
                            "الأيام الجاية وترجع لك أقرب موعد فعلي."
                        ),
                    },
                    "date_to": {
                        "type": "string",
                        "description": "ISO date/time للبحث قبله، أو نص فاضي لعدم وضع حد أعلى (الحالة الافتراضية لو ما ذُكر يوم محدد).",
                    },
                },
                "required": [
                    "doctor_name",
                    "specialty_query",
                    "doctor_gender",
                    "doctor_language",
                    "max_price",
                    "date_from",
                    "date_to",
                ],
                "additionalProperties": False,
            },
            "strict": True,
        },
    },
    {
        "type": "function",
        "function": {
            "name": "book_appointment",
            "description": (
                "احجز موعداً فعلياً — فقط بعد ما المريض يأكد صراحة وقتاً محدداً كان قد ظهر فعلاً بنتيجة "
                "find_available_slots. مررّي اسم الطبيب والوقت بالضبط متل ما ظهروا لك — الأداة نفسها "
                "بتتحقق وتحجز بخطوة وحدة. إذا رجعت النتيجة booked=false، معناها الوقت انحجز من حد ثاني "
                "أو تغيّر، وبترجع لك alternative_slots حقيقية بديلة — اعرضيها للمريض، ممنوع تخترعي بديل "
                "من عندك ولا تفترضي إن هذا سيناريو متكرر بدون ما تشوفي alternative_slots فعلياً بكل مرة."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "doctor_name": {
                        "type": "string",
                        "description": "اسم الطبيب بالضبط متل ما ظهر بنتيجة find_available_slots.",
                    },
                    "start_at": {
                        "type": "string",
                        "description": (
                            "قيمة start_at_clinic_local_time بالضبط متل ما رجعت من find_available_slots "
                            "للوقت يلي أكّده المريض — انسخيها حرفياً، لا تعيدي كتابتها أو تحسبيها يدوياً."
                        ),
                    },
                    "visit_for_name": {
                        "type": "string",
                        "description": "اسم الشخص المقصود بالزيارة كما ذكره المريض، أو نص فاضي إذا لم يُذكر.",
                    },
                    "reason_for_visit": {
                        "type": "string",
                        "description": "سبب الزيارة/الأعراض كما وصفها المريض، أو نص فاضي.",
                    },
                },
                "required": ["doctor_name", "start_at", "visit_for_name", "reason_for_visit"],
                "additionalProperties": False,
            },
            "strict": True,
        },
    },
    {
        "type": "function",
        "function": {
            "name": "find_my_appointments",
            "description": (
                "اعرض مواعيد هذا المريض الحالية/القادمة (غير الملغاة وغير المنتهية) في هذا الفرع. "
                "استدعِها دائماً قبل أي محاولة لإلغاء موعد أو الرد على سؤال عن موعد موجود، عشان تحصلي "
                "على appointment_id الحقيقي — ممنوع افتراض أو تخمين أي موعد."
            ),
            "parameters": {"type": "object", "properties": {}, "required": [], "additionalProperties": False},
            "strict": True,
        },
    },
    {
        "type": "function",
        "function": {
            "name": "cancel_appointment",
            "description": (
                "ألغِ موعداً فعلياً لهذا المريض — فقط بعد ما يأكد صراحة إنه بدو يلغي، وبعد ما تستدعي "
                "find_my_appointments بنفس الرد للحصول على appointment_id الصحيح. قد يترتب على الإلغاء "
                "رسم حسب سياسة العيادة إذا كان قريباً من موعد الزيارة — النتيجة برجع لك المبلغ إذا انطبق."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "appointment_id": {
                        "type": "string",
                        "description": "appointment_id الراجع لتوه من find_my_appointments بنفس هذا الرد.",
                    },
                    "reason": {
                        "type": "string",
                        "description": "سبب الإلغاء كما ذكره المريض، أو نص فاضي.",
                    },
                },
                "required": ["appointment_id", "reason"],
                "additionalProperties": False,
            },
            "strict": True,
        },
    },
]

REPLY_SCHEMA = {
    "type": "json_schema",
    "json_schema": {
        "name": "clinic_reply",
        "schema": {
            "type": "object",
            "properties": {
                "reply": {"type": "string"},
                "needs_human": {"type": "boolean"},
            },
            "required": ["reply", "needs_human"],
            "additionalProperties": False,
        },
        "strict": True,
    },
}


class ReplyRequest(BaseModel):
    conversation_id: str
    message: str


class ReplyResponse(BaseModel):
    reply: str
    needs_human: bool
    skipped: bool = False
    # Set only when this turn just booked an appointment — a QR image URL
    # for the calling channel workflow to fetch (with the service token)
    # and relay to the patient as a photo. Never shown to the model/patient
    # as a link: the endpoint it points to isn't patient-fetchable.
    image_url: str | None = None


GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/"


def _load_provider_overrides(db: Client) -> dict:
    """Lets clinic staff change the OpenAI/Gemini key from the dashboard
    (backend's /settings/ai-providers) without a redeploy — checked on every
    call so a key change takes effect immediately. Falls back to the
    OPENAI_API_KEY/GEMINI_API_KEY env vars (via the caller) when a column
    here is null, and never lets a lookup hiccup break reply generation."""
    try:
        return db.table("ai_provider_settings").select("*").limit(1).single().execute().data or {}
    except Exception:
        logger.exception("failed to load ai_provider_settings, falling back to env vars")
        return {}


def _decrypt_or_none(value: str | None) -> str | None:
    if not value:
        return None
    try:
        return decrypt_secret(value)
    except Exception:
        logger.exception("failed to decrypt a stored AI provider key, falling back to env var")
        return None


def _get_openai(db: Client = Depends(get_supabase), settings: Settings = Depends(get_settings)) -> OpenAI:
    overrides = _load_provider_overrides(db)
    api_key = _decrypt_or_none(overrides.get("openai_api_key_encrypted")) or settings.openai_api_key
    if not api_key:
        raise HTTPException(
            status_code=501,
            detail="OPENAI_API_KEY not configured — set it in .env or the dashboard's AI settings page.",
        )
    return OpenAI(api_key=api_key)


def _get_gemini_fallback(
    db: Client = Depends(get_supabase), settings: Settings = Depends(get_settings)
) -> tuple[OpenAI, str] | None:
    """Gemini exposes an OpenAI-compatible endpoint, so the same OpenAI SDK
    client works against it (just a different base_url/api_key/model) — lets
    _run_conversation_turn fall back without a second code path. Returns None
    when no Gemini key is configured (dashboard or env), in which case an
    OpenAI failure degrades straight to human handoff, same as before this
    fallback existed."""
    overrides = _load_provider_overrides(db)
    api_key = _decrypt_or_none(overrides.get("gemini_api_key_encrypted")) or settings.gemini_api_key
    if not api_key:
        return None
    model = overrides.get("gemini_model") or settings.gemini_model
    return OpenAI(api_key=api_key, base_url=GEMINI_BASE_URL), model


def _load_conversation(db: Client, conversation_id: str) -> dict:
    conv = (
        db.table("conversations")
        .select("id, mode, patient_id, channel_id, ai_episode_started_at, channels(branch_id)")
        .eq("id", conversation_id)
        .single()
        .execute()
        .data
    )
    conv["branch_id"] = conv["channels"]["branch_id"]
    return conv


def _load_channel_settings(db: Client, channel_id: str) -> dict:
    rows = db.table("channel_settings").select("*").eq("channel_id", channel_id).limit(1).execute().data
    return rows[0] if rows else _DEFAULT_CHANNEL_SETTINGS


def _count_ai_turns(db: Client, conversation_id: str, since: str) -> int:
    """Scoped to the current AI episode (since ai_episode_started_at), not the
    conversation's whole lifetime — a conversation stays open indefinitely
    (handle_inbound_message reuses the same row across days), so counting
    forever meant any long-lived thread permanently tripped the cap regardless
    of how the current round was going."""
    result = (
        db.table("messages")
        .select("id", count="exact")
        .eq("conversation_id", conversation_id)
        .eq("sender_type", "ai")
        .gte("created_at", since)
        .execute()
    )
    return result.count or 0


_HISTORY_LIMIT = 24  # ~12 exchanges — see _load_history

_ARABIC_WEEKDAYS = ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"]


def _load_history(db: Client, conversation_id: str) -> list[dict]:
    """Bounded to the most recent messages, not the conversation's entire
    lifetime — a conversation stays open indefinitely (the same row gets
    reused across days/weeks), so feeding the model unlimited history means
    stale facts from hours or days ago (a doctor who has since been deleted,
    an old failed booking attempt) sit right next to the current question
    with nothing marking them as outdated, and the model has no reliable way
    to tell "still true" from "was true when I said it.\""""
    rows = (
        db.table("messages")
        .select("direction, content")
        .eq("conversation_id", conversation_id)
        .order("created_at", desc=True)
        .limit(_HISTORY_LIMIT)
        .execute()
        .data
    )
    rows.reverse()
    return [{"role": "user" if r["direction"] == "inbound" else "assistant", "content": r["content"]} for r in rows]


def _build_system_prompt(db: Client, branch_id: str, ch_settings: dict) -> str:
    settings_row = db.table("clinic_settings").select("clinic_name, about_text").limit(1).execute().data
    branch_rows = (
        db.table("branches")
        .select("name, address, phone, working_hours_note, timezone")
        .eq("id", branch_id)
        .limit(1)
        .execute()
        .data
    )
    services = (
        db.table("services")
        .select("name, duration_minutes, price")
        .eq("is_active", True)
        .is_("deleted_at", "null")
        .execute()
        .data
    )

    parts = [BASE_INSTRUCTIONS]
    if ch_settings.get("dialect"):
        parts.append(f"استخدم لهجة: {ch_settings['dialect']}")

    tz_name = (branch_rows[0].get("timezone") if branch_rows else None) or "Asia/Amman"
    now_local = datetime.now(ZoneInfo(tz_name))
    weekday_ar = _ARABIC_WEEKDAYS[(now_local.weekday() + 1) % 7]
    parts.append(
        f"التاريخ والوقت الحاليين (بتوقيت العيادة): يوم {weekday_ar} {now_local.strftime('%Y-%m-%d %H:%M')}. "
        "استخدمي هذا كمرجع فقط لما المريض يذكر صراحة يوم أو تاريخ نسبي (بكرا، السبت الجاي، بعد يومين) "
        "— بس هيك احسبي date_from ببداية اليوم المقصود وdate_to ببداية اليوم يلي بعده. أما لو المريض ما "
        "ذكر أي يوم أو تاريخ (مثلاً سأل 'شو المواعيد المتاحة' بشكل عام)، اتركي date_from وdate_to فاضيين "
        "تماماً — ممنوع تفترضي 'بكرا' أو 'أقرب يومين' من عندك، الأداة أصلاً بترجع أقرب المواعيد مرتبة "
        "زمنياً بدون أي تحديد."
    )

    clinic_name = settings_row[0]["clinic_name"] if settings_row else ""
    about_text = settings_row[0]["about_text"] if settings_row else ""
    if clinic_name:
        parts.append(f"اسم العيادة: {clinic_name}")
    if about_text:
        parts.append(f"عن العيادة: {about_text}")

    if branch_rows:
        b = branch_rows[0]
        details = [b["name"]]
        if b.get("address"):
            details.append(b["address"])
        if b.get("phone"):
            details.append(f"tel: {b['phone']}")
        if b.get("working_hours_note"):
            details.append(f"hours: {b['working_hours_note']}")
        parts.append("الفرع: " + " | ".join(details))

    if services:
        lines = ["الخدمات:"]
        for s in services:
            price = f"{s['price']}" if s.get("price") is not None else "N/A"
            lines.append(f"- {s['name']} ({s['duration_minutes']} min, price: {price})")
        parts.append("\n".join(lines))

    return "\n\n".join(parts)


def _select_tools(ch_settings: dict) -> list[dict]:
    mode = ch_settings.get("ai_mode", "full_booking")
    if mode == "greeting_only":
        return []
    if mode == "inquiry_only":
        return [t for t in TOOLS if t["function"]["name"] not in ("book_appointment", "cancel_appointment")]
    return TOOLS


def _execute_tool(db: Client, ctx: dict, name: str, args: dict) -> dict:
    try:
        if name == "find_doctors":
            return {"doctors": find_doctors(db, ctx["branch_id"], args.get("specialty_query") or None)}
        if name == "find_available_slots":
            return search_available_slots(
                db,
                ctx["branch_id"],
                doctor_name=args.get("doctor_name") or None,
                specialty_query=args.get("specialty_query") or None,
                doctor_gender=args.get("doctor_gender") or None,
                doctor_language=args.get("doctor_language") or None,
                max_price=args.get("max_price") or None,
                date_from=args.get("date_from") or None,
                date_to=args.get("date_to") or None,
            )
        if name == "book_appointment":
            if not ctx.get("booking_enabled"):
                return {"error": "الحجز غير متاح حالياً عبر هذه المحادثة."}
            if not ctx.get("patient_id"):
                return {"error": "ما في رقم هاتف موثوق لهذا المستخدم بعد — اطلب منه رقمه قبل ما تكمل الحجز."}
            booking_result = book_by_doctor_and_time(
                db,
                ctx["branch_id"],
                doctor_name=args["doctor_name"],
                requested_start_at=args["start_at"],
                patient_id=ctx["patient_id"],
                visit_for_name=args.get("visit_for_name") or None,
                notes=args.get("reason_for_visit") or None,
            )
            if not booking_result["booked"]:
                return {
                    "booked": False,
                    "reason": booking_result["reason"],
                    "alternative_slots": booking_result["alternative_slots"],
                }
            appointment = booking_result
            ctx["_booked_appointment_id"] = appointment["id"]
            payment_info = confirm_booking_and_request_payment(db, appointment["id"])
            result = {
                "booked": True,
                "appointment_number": appointment["appointment_number"],
                "confirmation_code": appointment["confirmation_code"],
                "scheduled_at": appointment["scheduled_at"],
                "deposit_required": bool(payment_info),
            }
            # Kept so that if the tool loop runs out of rounds before the model
            # writes its reply, we can still tell the patient their booking is
            # real instead of a generic failure — see _run_conversation_turn.
            ctx["_booked_appointment_number"] = appointment["appointment_number"]
            if payment_info:
                result["deposit_amount"] = payment_info["amount"]
                result["deposit_currency"] = payment_info["currency"]
                result["payment_methods"] = payment_info["methods_text"]
            return result
        if name == "find_my_appointments":
            if not ctx.get("patient_id"):
                return {"appointments": []}
            return {"appointments": find_upcoming_appointments_for_patient(db, ctx["patient_id"])}
        if name == "cancel_appointment":
            if not ctx.get("patient_id"):
                return {"error": "ما في رقم هاتف موثوق لهذا المستخدم بعد."}
            result = cancel_patient_appointment(
                db,
                appointment_id=args["appointment_id"],
                patient_id=ctx["patient_id"],
                reason=args.get("reason") or None,
            )
            return {
                "cancelled": True,
                "fee_charged": result["fee"],
                "currency": result.get("currency"),
                "appointment_number": result.get("appointment_number"),
            }
        return {"error": f"unknown tool {name}"}
    except BookingError as exc:
        return {"error": str(exc)}
    except Exception:
        logger.exception("tool %s failed with args %s", name, args)
        return {"error": "صار خطأ تقني بسيط، جرب طلب تاني أو اطلب التحويل لموظف."}


# A booking routinely costs 3-4 rounds (find_doctors -> find_available_slots ->
# book_appointment -> reply), and models spend extra rounds on redundant
# lookups or on retrying after a slot was taken. At 5 a perfectly ordinary
# "book me with Dr X tomorrow at 9" was tipping over the limit and the patient
# got a handoff message instead of a booking, so keep real headroom above the
# common path.
_MAX_TOOL_ROUNDS = 10


def _run_conversation_turn(
    client: OpenAI,
    system_prompt: str,
    history: list[dict],
    tools: list[dict],
    db: Client,
    ctx: dict,
    fallback: tuple[OpenAI, str] | None = None,
) -> tuple[str, bool]:
    messages = [{"role": "system", "content": system_prompt}] + history
    active_client, active_model = client, "gpt-4o-mini"
    for _ in range(_MAX_TOOL_ROUNDS):
        kwargs = {"model": active_model, "messages": messages, "response_format": REPLY_SCHEMA}
        if tools:
            kwargs["tools"] = tools
        try:
            completion = active_client.chat.completions.create(**kwargs)
        except Exception:
            # OpenAI outage/rate limit/etc mid-turn — switch to Gemini for
            # the rest of this turn (not just this one call) so a down
            # OpenAI doesn't mean re-failing on every remaining tool-call
            # round-trip before finally giving up.
            if active_client is not client or fallback is None:
                raise
            logger.warning("OpenAI call failed, switching to Gemini fallback for this turn", exc_info=True)
            active_client, active_model = fallback
            kwargs["model"] = active_model
            completion = active_client.chat.completions.create(**kwargs)
        message = completion.choices[0].message

        if message.tool_calls:
            messages.append(
                {
                    "role": "assistant",
                    "content": message.content,
                    "tool_calls": [tc.model_dump() for tc in message.tool_calls],
                }
            )
            for tool_call in message.tool_calls:
                args = json.loads(tool_call.function.arguments)
                result = _execute_tool(db, ctx, tool_call.function.name, args)
                messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": tool_call.id,
                        "content": json.dumps(result, ensure_ascii=False),
                    }
                )
            continue

        parsed = json.loads(message.content)
        return parsed["reply"], parsed["needs_human"]

    booked_number = ctx.get("_booked_appointment_number")
    if booked_number:
        # The booking itself went through on one of those rounds; the model just
        # never got around to writing the confirmation. Telling this patient
        # "I couldn't finish" would be false — they have a real appointment, and
        # they'd likely rebook and double-book themselves.
        return (
            f"تم تثبيت حجزك فعلاً ورقمه {booked_number} — خليه عندك للمراجعة. "
            "بحكيلك موظف يأكدلك باقي التفاصيل.",
            True,
        )
    return "بواجهني ازدحام بسيط وما قدرت أكمل — حابب أوصلك مع أحد الفريق؟", True


def _store_reply(db: Client, conversation_id: str, reply: str) -> None:
    db.table("messages").insert(
        {
            "conversation_id": conversation_id,
            "direction": "outbound",
            "sender_type": "ai",
            "content": reply,
        }
    ).execute()
    db.table("conversations").update(
        {
            "last_message_at": datetime.now(timezone.utc).isoformat(),
            "last_message_preview": reply[:200],
            "last_sender": "ai",
        }
    ).eq("id", conversation_id).execute()


def _escalate(db: Client, conversation_id: str) -> None:
    # escalated_at (not last_message_at) is what reclaim_stale_conversations
    # times out against — last_message_at gets touched by every inbound
    # patient message too, so a patient who keeps texting while waiting would
    # otherwise keep resetting the "no staff reply yet" clock indefinitely.
    db.table("conversations").update(
        {"mode": "human", "needs_attention": True, "escalated_at": datetime.now(timezone.utc).isoformat()}
    ).eq("id", conversation_id).execute()


@router.post("/reply", response_model=ReplyResponse, dependencies=[Depends(require_service_token)])
def generate_reply(
    payload: ReplyRequest,
    db: Client = Depends(get_supabase),
    client: OpenAI = Depends(_get_openai),
    fallback: tuple[OpenAI, str] | None = Depends(_get_gemini_fallback),
    settings: Settings = Depends(get_settings),
):
    """Called by the backend (or directly by n8n) to turn an inbound patient
    message into a reply, grounded in the conversation history stored in
    Supabase, with real tools to look up doctors/slots and to actually book —
    never just a confident-sounding sentence. Skips generating anything if
    the conversation has been switched to human-handled."""
    conv = _load_conversation(db, payload.conversation_id)
    if conv["mode"] == "human":
        return ReplyResponse(reply="", needs_human=True, skipped=True)

    ch_settings = _load_channel_settings(db, conv["channel_id"])
    if not ch_settings.get("ai_enabled", True):
        _escalate(db, payload.conversation_id)
        return ReplyResponse(reply="", needs_human=True, skipped=True)

    lowered = payload.message.lower()
    keyword_hit = any(k.lower() in lowered for k in (ch_settings.get("escalation_keywords") or []) if k)
    turn_limit = ch_settings.get("max_ai_turns_before_human") or 10
    turn_limit_hit = _count_ai_turns(db, payload.conversation_id, conv["ai_episode_started_at"]) >= turn_limit

    if keyword_hit or turn_limit_hit:
        reply = ch_settings.get("handoff_message") or _DEFAULT_HANDOFF_MESSAGE
        _store_reply(db, payload.conversation_id, reply)
        _escalate(db, payload.conversation_id)
        return ReplyResponse(reply=reply, needs_human=True)

    history = _load_history(db, payload.conversation_id)
    system_prompt = _build_system_prompt(db, conv["branch_id"], ch_settings)
    ctx = {
        "branch_id": conv["branch_id"],
        "patient_id": conv.get("patient_id"),
        "booking_enabled": ch_settings.get("ai_mode", "full_booking") == "full_booking",
    }
    tools = _select_tools(ch_settings)

    try:
        reply, needs_human = _run_conversation_turn(client, system_prompt, history, tools, db, ctx, fallback)
    except Exception as exc:
        # Whatever broke (OpenAI outage/rate limit, an unexpected tool
        # failure, ...) — a patient waiting on a reply must never see a raw
        # 500. Degrade to the same human handoff used for keyword/turn-limit
        # escalation instead of crashing the request. Also record the real
        # exception in audit_log — Railway's own logs aren't queryable from
        # here, and this failure mode has been intermittent enough that
        # "log and hope" wasn't cutting it.
        logger.exception("chat turn failed for conversation_id=%s", payload.conversation_id)
        try:
            db.table("audit_log").insert(
                {
                    "entity_type": "ai_chat_turn",
                    "entity_id": payload.conversation_id,
                    "action": "chat_turn_failed",
                    "reason": f"{type(exc).__name__}: {str(exc)[:500]}",
                    "channel": "ai-services",
                }
            ).execute()
        except Exception:
            logger.exception("failed to record chat turn failure in audit_log")
        reply = ch_settings.get("handoff_message") or _DEFAULT_HANDOFF_MESSAGE
        needs_human = True

    _store_reply(db, payload.conversation_id, reply)
    if needs_human:
        _escalate(db, payload.conversation_id)

    image_url = None
    booked_appointment_id = ctx.get("_booked_appointment_id")
    if booked_appointment_id and settings.backend_public_url:
        image_url = f"{settings.backend_public_url}/appointments/{booked_appointment_id}/qr-code.png"

    return ReplyResponse(reply=reply, needs_human=needs_human, image_url=image_url)


@router.post("/reclaim-stale", dependencies=[Depends(require_service_token)])
def reclaim_stale_conversations(
    db: Client = Depends(get_supabase),
    client: OpenAI = Depends(_get_openai),
    fallback: tuple[OpenAI, str] | None = Depends(_get_gemini_fallback),
):
    """Polled periodically by an external scheduler (n8n Schedule Trigger),
    same pattern as backend's /notifications/process-due. Finds conversations
    escalated to a human that no staff member answered within the channel's
    configured timeout, hands them back to the AI, and has it reply once to
    the whole backlog of patient messages that piled up while it was silent —
    then delivers that reply itself, since there's no live n8n execution
    waiting on this response to relay it."""
    now = datetime.now(timezone.utc)
    candidates = (
        db.table("conversations")
        .select("id, channel_id, last_message_at, escalated_at")
        .eq("mode", "human")
        .eq("needs_attention", True)
        .execute()
        .data
    )

    reclaimed = []
    for row in candidates:
        # Prefer escalated_at (when this handoff actually started) over
        # last_message_at — the latter is touched by every inbound patient
        # message too, so a patient re-messaging while waiting would
        # otherwise keep pushing the timeout out instead of ever tripping it.
        # Fall back to last_message_at only for rows escalated before
        # escalated_at existed.
        stale_since = row.get("escalated_at") or row.get("last_message_at")
        if not stale_since:
            continue
        ch_settings = _load_channel_settings(db, row["channel_id"])
        timeout_minutes = ch_settings.get("human_handoff_timeout_minutes", 20)
        last = datetime.fromisoformat(stale_since.replace("Z", "+00:00"))
        if now - last < timedelta(minutes=timeout_minutes):
            continue
        if not ch_settings.get("ai_enabled", True):
            continue

        db.table("conversations").update(
            {"mode": "ai", "needs_attention": False, "ai_episode_started_at": now.isoformat()}
        ).eq("id", row["id"]).execute()
        try:
            conv = _load_conversation(db, row["id"])
            history = _load_history(db, row["id"])
            system_prompt = _build_system_prompt(db, conv["branch_id"], ch_settings)
            ctx = {
                "branch_id": conv["branch_id"],
                "patient_id": conv.get("patient_id"),
                "booking_enabled": ch_settings.get("ai_mode", "full_booking") == "full_booking",
            }
            tools = _select_tools(ch_settings)

            reply, needs_human = _run_conversation_turn(client, system_prompt, history, tools, db, ctx, fallback)
            _store_reply(db, row["id"], reply)
            if needs_human:
                _escalate(db, row["id"])
            deliver_outbound_message(db, row["channel_id"], conv.get("patient_id"), reply)
            reclaimed.append(row["id"])
        except Exception:
            logger.exception("failed to reclaim conversation %s", row["id"])

    return {"reclaimed": len(reclaimed), "conversation_ids": reclaimed}
