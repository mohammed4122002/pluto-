import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { listConversations, getConversation, updateConversation, sendStaffReply } from "../api/conversations";
import type { ConversationSummary, ConversationDetail } from "../api/conversations";
import { listEscalationStaff } from "../api/escalationStaff";
import type { EscalationStaffMember } from "../api/escalationStaff";
import { formatDayMonth, formatTime } from "../format";

const channelLabel: Record<string, string> = {
  whatsapp: "واتساب",
  telegram: "تيليجرام",
  instagram: "إنستجرام",
  messenger: "ماسنجر",
};

type InboxPageProps = {
  // So the "معي" filter can default to the logged-in staff member's own
  // assigned conversations without them picking themselves from a list.
  currentStaffId?: string;
};

/** Arabic names don't shrink to a two-letter monogram the way Latin ones do,
 *  so one letter is the whole avatar -- same call App.tsx already made for
 *  the account menu. */
function initial(name: string) {
  return name.trim()[0] ?? "؟";
}

function dayKey(d: Date) {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/** A compact "when" for the conversation list: just the time for anything
 *  from today (the common case), a day+month once it's older, so a
 *  months-old thread doesn't crowd the row with a full date. */
function listStamp(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  return dayKey(d) === dayKey(new Date()) ? formatTime(d) : formatDayMonth(d);
}

export function InboxPage({ currentStaffId }: InboxPageProps = {}) {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [pool, setPool] = useState<EscalationStaffMember[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [onlyNeedsAttention, setOnlyNeedsAttention] = useState(false);
  const [onlyMine, setOnlyMine] = useState(false);
  const [search, setSearch] = useState("");

  const loadList = () => {
    setError(null);
    listConversations(onlyNeedsAttention || undefined, onlyMine && currentStaffId ? currentStaffId : undefined)
      .then(setConversations)
      .catch((err) => setError(err.message));
  };

  useEffect(loadList, [onlyNeedsAttention, onlyMine]);
  useEffect(() => {
    listEscalationStaff()
      .then((rows) => setPool(rows.filter((r) => r.is_active)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    getConversation(selectedId)
      .then(setDetail)
      .catch((err) => setError(err.message));
  }, [selectedId]);

  const refreshSelected = () => {
    if (!selectedId) return;
    getConversation(selectedId).then(setDetail).catch((err) => setError(err.message));
    loadList();
  };

  const handleReply = (e: FormEvent) => {
    e.preventDefault();
    if (!selectedId || !replyText.trim()) return;
    setSending(true);
    sendStaffReply(selectedId, replyText)
      .then(() => {
        setReplyText("");
        refreshSelected();
      })
      .catch((err) => setError(err.message))
      .finally(() => setSending(false));
  };

  const toggleMode = () => {
    if (!detail) return;
    updateConversation(detail.id, { mode: detail.mode === "ai" ? "human" : "ai" })
      .then(refreshSelected)
      .catch((err) => setError(err.message));
  };

  const assignStaff = (staffId: string) => {
    if (!detail) return;
    updateConversation(detail.id, { assigned_staff_id: staffId || null, needs_attention: false })
      .then(refreshSelected)
      .catch((err) => setError(err.message));
  };

  // Needing attention first regardless of recency -- that's the queue a
  // reception shift actually works from -- then most-recent within each
  // group, same order the backend already returns.
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q ? conversations.filter((c) => c.patient_name.toLowerCase().includes(q)) : conversations;
    return [...filtered].sort((a, b) => Number(b.needs_attention) - Number(a.needs_attention));
  }, [conversations, search]);

  const attentionCount = conversations.filter((c) => c.needs_attention).length;

  return (
    <div className="page inbox-page">
      <div className="page-header">
        <div>
          <div className="page-header-title">المحادثات</div>
          <div className="page-header-subtitle">
            محادثات المرضى عبر القنوات — المحوّلة إلك بتظهر أول، والباقي بيتابعها المساعد الذكي.
          </div>
        </div>
      </div>
      {error && <p className="error">{error}</p>}

      <div className="inbox-toolbar">
        <div className="search-input inbox-search">
          <input placeholder="بحث باسم المريض..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <button
          type="button"
          className={onlyNeedsAttention ? "filter-chip active" : "filter-chip"}
          onClick={() => setOnlyNeedsAttention((v) => !v)}
        >
          محتاجة متابعة{attentionCount > 0 && ` (${attentionCount})`}
        </button>
        {currentStaffId && (
          <button type="button" className={onlyMine ? "filter-chip active" : "filter-chip"} onClick={() => setOnlyMine((v) => !v)}>
            المحوّلة إلي
          </button>
        )}
      </div>

      <div className="inbox-layout">
        <div className="inbox-list">
          {visible.map((c) => (
            <button
              key={c.id}
              className={c.id === selectedId ? "inbox-item active" : "inbox-item"}
              onClick={() => setSelectedId(c.id)}
            >
              <span className="inbox-item-avatar" aria-hidden>
                {initial(c.patient_name)}
              </span>
              <span className="inbox-item-body">
                <span className="inbox-item-top">
                  <span className="inbox-item-name">{c.patient_name}</span>
                  <span className="inbox-item-time">{listStamp(c.last_message_at)}</span>
                </span>
                <span className="inbox-item-preview">{c.last_message_preview ?? "—"}</span>
                <span className="inbox-item-meta">
                  <span className="badge inactive">{channelLabel[c.channel_type] ?? c.channel_type}</span>
                  <span className={c.mode === "ai" ? "badge active" : "badge inactive"}>
                    {c.mode === "ai" ? "AI" : "موظف"}
                  </span>
                </span>
              </span>
              {c.needs_attention && <span className="dot-alert" />}
            </button>
          ))}
          {visible.length === 0 && (
            <p className="inbox-empty">{search ? "ما في نتائج مطابقة." : "ما في محادثات."}</p>
          )}
        </div>

        <div className="inbox-thread">
          {!detail ? (
            <p className="inbox-empty">اختر محادثة من القائمة.</p>
          ) : (
            <>
              <div className="inbox-thread-header">
                <div className="inbox-thread-who">
                  <span className="inbox-item-avatar" aria-hidden>
                    {initial(detail.patient_name)}
                  </span>
                  <div>
                    <strong>{detail.patient_name}</strong>
                    <span className="inbox-thread-phone" dir="ltr">
                      {detail.patient_phone}
                    </span>
                  </div>
                </div>
                <div className="inbox-thread-controls">
                  <button onClick={toggleMode}>
                    {detail.mode === "ai" ? "حوّل لموظف (تلقائي)" : "رجّع للـ AI"}
                  </button>
                  <select value={detail.assigned_staff_id ?? ""} onChange={(e) => assignStaff(e.target.value)}>
                    <option value="">بدون تحويل</option>
                    {pool.map((s) => (
                      <option key={s.staff_id} value={s.staff_id}>
                        {s.staff_name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="inbox-messages">
                {detail.messages.map((m) => (
                  <div
                    key={m.id}
                    className={
                      m.direction === "inbound" ? "bubble bubble-in" : `bubble bubble-out bubble-${m.sender_type}`
                    }
                  >
                    <div className="bubble-content">{m.content}</div>
                    <div className="bubble-foot">
                      {m.direction === "outbound" && (
                        <span className="bubble-sender">{m.sender_type === "ai" ? "AI" : "موظف"}</span>
                      )}
                      <span className="bubble-time">{formatTime(m.created_at)}</span>
                    </div>
                  </div>
                ))}
              </div>

              <form className="inbox-reply-form" onSubmit={handleReply}>
                <input
                  placeholder="اكتب رد..."
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                />
                <button type="submit" disabled={sending || !replyText.trim()}>
                  {sending ? "..." : "إرسال"}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
