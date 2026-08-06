import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { listConversations, getConversation, updateConversation, sendStaffReply } from "../api/conversations";
import type { ConversationSummary, ConversationDetail } from "../api/conversations";
import { listEscalationStaff } from "../api/escalationStaff";
import type { EscalationStaffMember } from "../api/escalationStaff";

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

  return (
    <div className="page inbox-page">
      {error && <p className="error">{error}</p>}
      <label className="inbox-filter">
        <input
          type="checkbox"
          checked={onlyNeedsAttention}
          onChange={(e) => setOnlyNeedsAttention(e.target.checked)}
        />
        بس المحادثات المحتاجة متابعة
      </label>
      {currentStaffId && (
        <label className="inbox-filter">
          <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} />
          بس المحوّلة إلي
        </label>
      )}

      <div className="inbox-layout">
        <div className="inbox-list">
          {conversations.map((c) => (
            <button
              key={c.id}
              className={c.id === selectedId ? "inbox-item active" : "inbox-item"}
              onClick={() => setSelectedId(c.id)}
            >
              <div className="inbox-item-top">
                <span className="inbox-item-name">{c.patient_name}</span>
                {c.needs_attention && <span className="dot-alert" />}
              </div>
              <div className="inbox-item-preview">{c.last_message_preview ?? "—"}</div>
              <div className="inbox-item-meta">
                <span className="badge inactive">{channelLabel[c.channel_type] ?? c.channel_type}</span>
                <span className={c.mode === "ai" ? "badge active" : "badge inactive"}>
                  {c.mode === "ai" ? "AI" : "موظف"}
                </span>
              </div>
            </button>
          ))}
          {conversations.length === 0 && <p className="inbox-empty">ما في محادثات.</p>}
        </div>

        <div className="inbox-thread">
          {!detail ? (
            <p className="inbox-empty">اختر محادثة من القائمة.</p>
          ) : (
            <>
              <div className="inbox-thread-header">
                <div>
                  <strong>{detail.patient_name}</strong>
                  <span className="inbox-thread-phone"> — {detail.patient_phone}</span>
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
                    {m.direction === "outbound" && (
                      <div className="bubble-sender">{m.sender_type === "ai" ? "AI" : "موظف"}</div>
                    )}
                  </div>
                ))}
              </div>

              <form className="inbox-reply-form" onSubmit={handleReply}>
                <input
                  placeholder="اكتب رد..."
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                />
                <button type="submit" disabled={sending}>
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
