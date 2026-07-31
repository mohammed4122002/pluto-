import json
import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from openai import OpenAI
from pydantic import BaseModel
from supabase import Client

from app.core.config import Settings, get_settings
from app.core.database import get_supabase
from app.core.service_auth import require_service_token
from app.services.booking import BookingError, book_slot_for_patient, search_available_slots
from app.services.delivery import deliver_outbound_message
from app.services.directory import find_doctors

router = APIRouter(prefix="/chat", tags=["chat"])
logger = logging.getLogger("chat")

BASE_INSTRUCTIONS = (
    "أنت مساعد استقبال عيادة طبية يرد على واتساب/تيليجرام. رد دائماً بنفس اللغة واللهجة اللي "
    "كتب فيها المريض. كن ودوداً ومختصراً كموظف استقبال حقيقي بيرد عبر الشات.\n\n"
    "قواعد صارمة بخصوص الحجز والمعلومات — ممنوع الكذب أو الاختراع:\n"
    "- ممنوع نهائياً ذكر اسم طبيب أو تخصص من عندك بدون استدعاء أداة find_doctors أولاً.\n"
    "- ممنوع نهائياً اقتراح أي وقت أو تاريخ موعد بدون استدعاء أداة find_available_slots أولاً "
    "والحصول على slot_id حقيقي منها.\n"
    "- ممنوع نهائياً قول 'تم الحجز' أو تأكيد أي حجز قبل استدعاء أداة book_appointment والتأكد أنها "
    "رجعت نجاحاً فعلياً. استدعِ هذه الأداة فقط بعد ما المريض يأكد صراحة على وقت محدد رجع لك من "
    "find_available_slots — لا تخترع slot_id أبداً.\n"
    "- بعد نجاح الحجز، أخبر المريض برقم الحجز ووقته، ووضّح إنه رح يوصله تأكيد نهائي من الفريق قريباً "
    "(الحجز يدخل مبدئياً بانتظار المراجعة، مش مؤكد 100% فوراً).\n"
    "- إذا رجعت أي أداة نتيجة فاضية أو خطأ، اعتذر بصدق واقترح بديل حقيقي (تخصص/وقت تاني) أو اعرض "
    "تحويله لموظف — لا تخترع بديل من عندك.\n"
    "- المواعيد المتاحة (find_available_slots) مرتبطة بجدول الطبيب نفسه، مش بخدمة معينة — يعني عدم "
    "وجود موعد ليوم/طبيب معين ما يعني عدم وجود مواعيد لخدمة ثانية أو يوم ثاني. كل مرة المريض يسأل عن "
    "مواعيد متاحة (حتى لو سأل قبل بنفس المحادثة عن يوم مختلف)، استدعِ find_available_slots من جديد "
    "بالطبيب والتاريخ المطلوبين — لا تعمم من نتيجة سابقة ولا تفترض 'ما في مواعيد إطلاقاً' بدون استدعاء "
    "الأداة لنفس الطلب الجديد.\n\n"
    "قواعد التصعيد (needs_human) — مهم جداً تفرق بين الحالتين:\n"
    "- لا تصعّد أبداً لمجرد إن المريض وصف عرض أو سبب زيارة عشان يتحدد التخصص/الطبيب المناسب "
    "(مثال: 'عندي سخونة'، 'حبوب بالبشرة', 'بدي أسنان') — هاد سؤال حجز طبيعي، كمّل معه عادي.\n"
    "- صعّد (needs_human=true) فقط لما المريض يطلب فعلاً استشارة أو تشخيص طبي حقيقي (مثال: "
    "'هل هاد خطير؟'، 'شو الدواء المناسب؟')، أو عنده شكوى، أو نزاع دفع/استرجاع، أو طلب معلومة مش "
    "موجودة عندك إطلاقاً. لما تصعّد، اكتب رد قصير يطمّن المريض إن حد من الفريق رح يتواصل معه قريباً."
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
                "سبب الزيارة. استخدمها دائماً قبل ذكر أي اسم طبيب أو تخصص للمريض."
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
                    "date_from": {
                        "type": "string",
                        "description": "ISO date/time للبحث بعده، أو نص فاضي للبحث من الآن.",
                    },
                    "date_to": {
                        "type": "string",
                        "description": "ISO date/time للبحث قبله، أو نص فاضي لعدم وضع حد أعلى.",
                    },
                },
                "required": ["doctor_name", "date_from", "date_to"],
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
                "احجز موعداً فعلياً — فقط بعد ما المريض يأكد صراحة وقتاً محدداً رجع من "
                "find_available_slots. ممنوع نهائياً قول إن الحجز تم قبل استدعاء هذه الأداة."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "slot_id": {
                        "type": "string",
                        "description": "slot_id الذي رجع من find_available_slots حرفياً — لا تخترعه.",
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
                "required": ["slot_id", "visit_for_name", "reason_for_visit"],
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


def _get_openai(settings: Settings = Depends(get_settings)) -> OpenAI:
    if not settings.openai_api_key:
        raise HTTPException(
            status_code=501,
            detail="OPENAI_API_KEY not configured — set it in .env to enable reply generation.",
        )
    return OpenAI(api_key=settings.openai_api_key)


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


def _load_history(db: Client, conversation_id: str) -> list[dict]:
    rows = (
        db.table("messages")
        .select("direction, content")
        .eq("conversation_id", conversation_id)
        .order("created_at")
        .execute()
        .data
    )
    return [{"role": "user" if r["direction"] == "inbound" else "assistant", "content": r["content"]} for r in rows]


def _build_system_prompt(db: Client, branch_id: str, ch_settings: dict) -> str:
    settings_row = db.table("clinic_settings").select("clinic_name, about_text").limit(1).execute().data
    branch_rows = (
        db.table("branches")
        .select("name, address, phone, working_hours_note")
        .eq("id", branch_id)
        .limit(1)
        .execute()
        .data
    )
    services = (
        db.table("services").select("name, duration_minutes, price").eq("is_active", True).execute().data
    )

    parts = [BASE_INSTRUCTIONS]
    if ch_settings.get("dialect"):
        parts.append(f"استخدم لهجة: {ch_settings['dialect']}")

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
        return [t for t in TOOLS if t["function"]["name"] != "book_appointment"]
    return TOOLS


def _execute_tool(db: Client, ctx: dict, name: str, args: dict) -> dict:
    try:
        if name == "find_doctors":
            return {"doctors": find_doctors(db, ctx["branch_id"], args.get("specialty_query") or None)}
        if name == "find_available_slots":
            return {
                "slots": search_available_slots(
                    db,
                    ctx["branch_id"],
                    doctor_name=args.get("doctor_name") or None,
                    date_from=args.get("date_from") or None,
                    date_to=args.get("date_to") or None,
                )
            }
        if name == "book_appointment":
            if not ctx.get("booking_enabled"):
                return {"error": "الحجز غير متاح حالياً عبر هذه المحادثة."}
            if not ctx.get("patient_id"):
                return {"error": "ما في رقم هاتف موثوق لهذا المستخدم بعد — اطلب منه رقمه قبل ما تكمل الحجز."}
            appointment = book_slot_for_patient(
                db,
                slot_id=args["slot_id"],
                patient_id=ctx["patient_id"],
                visit_for_name=args.get("visit_for_name") or None,
                notes=args.get("reason_for_visit") or None,
            )
            return {
                "booked": True,
                "appointment_number": appointment["appointment_number"],
                "confirmation_code": appointment["confirmation_code"],
                "scheduled_at": appointment["scheduled_at"],
            }
        return {"error": f"unknown tool {name}"}
    except BookingError as exc:
        return {"error": str(exc)}
    except Exception:
        logger.exception("tool %s failed with args %s", name, args)
        return {"error": "صار خطأ تقني بسيط، جرب طلب تاني أو اطلب التحويل لموظف."}


def _run_conversation_turn(
    client: OpenAI, system_prompt: str, history: list[dict], tools: list[dict], db: Client, ctx: dict
) -> tuple[str, bool]:
    messages = [{"role": "system", "content": system_prompt}] + history
    for _ in range(5):
        kwargs = {"model": "gpt-4o-mini", "messages": messages, "response_format": REPLY_SCHEMA}
        if tools:
            kwargs["tools"] = tools
        completion = client.chat.completions.create(**kwargs)
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
    db.table("conversations").update({"mode": "human", "needs_attention": True}).eq("id", conversation_id).execute()


@router.post("/reply", response_model=ReplyResponse)
def generate_reply(
    payload: ReplyRequest,
    db: Client = Depends(get_supabase),
    client: OpenAI = Depends(_get_openai),
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

    reply, needs_human = _run_conversation_turn(client, system_prompt, history, tools, db, ctx)
    _store_reply(db, payload.conversation_id, reply)
    if needs_human:
        _escalate(db, payload.conversation_id)

    return ReplyResponse(reply=reply, needs_human=needs_human)


@router.post("/reclaim-stale", dependencies=[Depends(require_service_token)])
def reclaim_stale_conversations(db: Client = Depends(get_supabase), client: OpenAI = Depends(_get_openai)):
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
        .select("id, channel_id, last_message_at")
        .eq("mode", "human")
        .eq("needs_attention", True)
        .execute()
        .data
    )

    reclaimed = []
    for row in candidates:
        if not row.get("last_message_at"):
            continue
        ch_settings = _load_channel_settings(db, row["channel_id"])
        timeout_minutes = ch_settings.get("human_handoff_timeout_minutes", 20)
        last = datetime.fromisoformat(row["last_message_at"].replace("Z", "+00:00"))
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

            reply, needs_human = _run_conversation_turn(client, system_prompt, history, tools, db, ctx)
            _store_reply(db, row["id"], reply)
            if needs_human:
                _escalate(db, row["id"])
            deliver_outbound_message(db, row["channel_id"], conv.get("patient_id"), reply)
            reclaimed.append(row["id"])
        except Exception:
            logger.exception("failed to reclaim conversation %s", row["id"])

    return {"reclaimed": len(reclaimed), "conversation_ids": reclaimed}
