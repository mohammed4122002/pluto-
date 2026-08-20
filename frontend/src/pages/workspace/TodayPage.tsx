import { useCallback, useEffect, useState } from "react";
import { actOnMyTicket, getMyToday } from "../../api/me";
import type { MyToday } from "../../api/me";
import { errorMessage } from "../../api/errors";
import { formatFullDate, formatTime } from "../../format";

const channelLabel: Record<string, string> = {
  whatsapp: "واتساب",
  telegram: "تيليجرام",
  instagram: "إنستجرام",
  messenger: "ماسنجر",
};

const appointmentStatusLabel: Record<string, string> = {
  requested: "مطلوب",
  confirmed: "مؤكّد",
  patient_confirmed: "أكّده المريض",
  checked_in: "سجّل حضور",
  waiting: "بالانتظار",
  called: "تم النداء",
  in_consultation: "بالكشف",
  completed: "خلص",
  checked_out: "خرج",
  no_show: "ما حضر",
  cancelled: "ملغي",
};

const FINISHED = new Set(["completed", "checked_out", "no_show", "cancelled"]);

// An appointment time is the branch's own real-world time, not the
// viewer's -- see format.ts's TimeZoneOpt comment for the live incident
// that motivated branch-aware formatting.
function clockTime(iso: string | null, timeZone?: string) {
  if (!iso) return "—";
  return formatTime(iso, timeZone);
}

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return "صباح الخير";
  if (hour < 17) return "مساء الخير";
  return "مساء الخير";
}

export function TodayPage({ staffName, onGoTo }: { staffName: string; onGoTo: (tab: string) => void }) {
  const [today, setToday] = useState<MyToday | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    getMyToday()
      .then(setToday)
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  // Reception checks people in from the front desk while this screen is open.
  useEffect(() => {
    const timer = setInterval(() => getMyToday().then(setToday).catch(() => {}), 30000);
    return () => clearInterval(timer);
  }, []);

  const act = (ticketId: string, action: "start" | "complete") => {
    setBusy(true);
    setError(null);
    actOnMyTicket(ticketId, action)
      .then(load)
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setBusy(false));
  };

  const focus = today?.now_serving ?? today?.up_next ?? null;
  const isServing = Boolean(today?.now_serving);
  const upcoming = (today?.appointments ?? []).filter((a) => !FINISHED.has(a.status));
  // Best effort: MyToday has no branch of its own (it's the doctor's whole
  // day, and today's queue tickets don't carry one either), so "today" is
  // labelled using whichever branch the day's own appointments are at.
  const dateLabel = formatFullDate(new Date(), today?.appointments[0]?.branch_timezone);

  if (loading) {
    return (
      <div className="page">
        <div className="page-header">
          <div>
            <div className="page-header-title">{greeting()}</div>
            <div className="page-header-subtitle">{dateLabel}</div>
          </div>
        </div>
        <div className="stat-grid">
          {Array.from({ length: 3 }).map((_, i) => (
            <div className="stat-card" key={i}>
              <div className="skeleton-block" style={{ height: 40 }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-header-title">
            {greeting()}، {staffName}
          </div>
          <div className="page-header-subtitle">{dateLabel}</div>
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="stat-grid">
        <button className="stat-card stat-card-link" onClick={() => onGoTo("my-queue")}>
          <div className="stat-card-value">{today?.waiting_count ?? 0}</div>
          <div className="stat-card-label">بانتظارك هلق</div>
        </button>
        <button className="stat-card stat-card-link" onClick={() => onGoTo("my-calendar")}>
          <div className="stat-card-value">{today?.remaining_appointments ?? 0}</div>
          <div className="stat-card-label">مواعيد باقية اليوم</div>
        </button>
        <button className="stat-card stat-card-link" onClick={() => onGoTo("inbox")}>
          <div className="stat-card-value">{today?.needs_attention_count ?? 0}</div>
          <div className="stat-card-label">محادثات بدها رد</div>
        </button>
        <div className="stat-card">
          <div className="stat-card-value">{today?.completed_appointments ?? 0}</div>
          <div className="stat-card-label">خلصت اليوم</div>
        </div>
      </div>

      {focus ? (
        <div className="focus-card">
          <div className="focus-card-label">{isServing ? "عم تكشف على" : "المريض التالي"}</div>
          <div className="focus-card-name">{focus.patient_name}</div>
          <div className="focus-card-meta">
            رقم {focus.ticket_number} · سجّل حضور {clockTime(focus.checked_in_at, today?.appointments[0]?.branch_timezone)}
            {focus.patient_phone && (
              <>
                {" · "}
                <span dir="ltr">{focus.patient_phone}</span>
              </>
            )}
          </div>
          <div className="focus-card-actions">
            <button
              className="btn-primary"
              disabled={busy}
              onClick={() => act(focus.id, isServing ? "complete" : "start")}
            >
              {isServing ? "خلّصت الكشف" : "بلّش الكشف"}
            </button>
            <button className="btn-secondary" onClick={() => onGoTo("my-queue")}>
              كل الطابور
            </button>
          </div>
        </div>
      ) : (
        <div className="focus-card focus-card-calm">
          <div className="focus-card-label">الطابور</div>
          <div className="focus-card-name">ما في حدا بانتظارك</div>
          <div className="focus-card-meta">أول ما الاستقبال تسجّل حضور مريض إلك، بيظهر هون.</div>
        </div>
      )}

      <div className="today-columns">
        <section className="today-panel">
          <div className="today-panel-head">
            <h2>مواعيد اليوم</h2>
            <button className="link-button" onClick={() => onGoTo("my-calendar")}>
              التقويم كامل
            </button>
          </div>
          {upcoming.length === 0 ? (
            <p className="table-empty">
              {today?.appointments.length ? "خلصت كل مواعيد اليوم. 👏" : "ما في مواعيد إلك اليوم."}
            </p>
          ) : (
            <ul className="today-list">
              {upcoming.map((a) => (
                <li key={a.id}>
                  <span className="today-list-time">{clockTime(a.scheduled_at, a.branch_timezone)}</span>
                  <span className="today-list-main">
                    <strong>{a.patient_name}</strong>
                    <span className="today-list-sub">
                      {a.service_name ?? "بدون خدمة محددة"} · {a.branch_name}
                    </span>
                  </span>
                  <span className="badge inactive">{appointmentStatusLabel[a.status] ?? a.status}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="today-panel">
          <div className="today-panel-head">
            <h2>محادثات محوّلة إلك</h2>
            <button className="link-button" onClick={() => onGoTo("inbox")}>
              فتح المحادثات
            </button>
          </div>
          {(today?.conversations.length ?? 0) === 0 ? (
            <p className="table-empty">ما في محادثات محوّلة إلك.</p>
          ) : (
            <ul className="today-list">
              {today!.conversations.map((c) => (
                <li key={c.id}>
                  <span className="today-list-main">
                    <strong>
                      {c.patient_name}
                      {c.needs_attention && <span className="dot-alert" style={{ marginInlineStart: 6 }} />}
                    </strong>
                    <span className="today-list-sub">{c.last_message_preview ?? "—"}</span>
                  </span>
                  <span className="badge inactive">{channelLabel[c.channel_type] ?? c.channel_type}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
