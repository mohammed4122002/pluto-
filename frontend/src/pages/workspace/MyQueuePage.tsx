import { useCallback, useEffect, useState } from "react";
import { actOnMyTicket, getMyQueue } from "../../api/me";
import type { MyQueueDay } from "../../api/me";
import { errorMessage } from "../../api/errors";
import { queueStatusBadgeClass, queueStatusLabel as statusLabel } from "../../statusLabels";
import { formatTime } from "../../format";


const priorityLabel: Record<string, string> = {
  emergency: "طارئ",
  critical: "حرج",
  elderly: "كبير بالسن",
  special_needs: "احتياجات خاصة",
  child: "طفل",
  vip: "VIP",
};

const ticketTone: Record<string, string> = {
  waiting: "tone-amber",
  called: "tone-violet",
  in_progress: "tone-teal",
  done: "",
  skipped: "tone-rose",
};

// A check-in time is the branch's own real-world time, not the viewer's --
// see format.ts's TimeZoneOpt comment for the live incident that motivated
// branch-aware formatting.
function clockTime(iso: string | null, timeZone?: string) {
  if (!iso) return "—";
  return formatTime(iso, timeZone);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function MyQueuePage() {
  const [date, setDate] = useState(todayIso());
  const [day, setDay] = useState<MyQueueDay | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyTicket, setBusyTicket] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    getMyQueue(date)
      .then(setDay)
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  }, [date]);

  useEffect(load, [load]);

  // The queue moves while you're looking at it — reception checks people in
  // from the front desk, so a stale screen sends the doctor to call a patient
  // who already left.
  useEffect(() => {
    if (date !== todayIso()) return;
    const timer = setInterval(() => getMyQueue(date).then(setDay).catch(() => {}), 30000);
    return () => clearInterval(timer);
  }, [date]);

  const act = (ticketId: string, action: "call" | "start" | "complete" | "skip") => {
    setBusyTicket(ticketId);
    setError(null);
    actOnMyTicket(ticketId, action)
      .then(load)
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setBusyTicket(null));
  };

  const tickets = day?.queues.flatMap((q) => q.tickets) ?? [];
  const upNext = tickets.find((t) => t.status === "waiting" || t.status === "called");
  const inProgress = tickets.find((t) => t.status === "in_progress");

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-header-title">طابوري</div>
          <div className="page-header-subtitle">المرضى المسجّلين حضور عندك — بيتحدّث تلقائياً كل نص دقيقة.</div>
        </div>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>

      {error && <p className="error">{error}</p>}

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-card-value">{day?.waiting_count ?? 0}</div>
          <div className="stat-card-label">بانتظارك</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-value">{day?.in_progress_count ?? 0}</div>
          <div className="stat-card-label">بالكشف</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-value">{day?.done_count ?? 0}</div>
          <div className="stat-card-label">خلصوا</div>
        </div>
      </div>

      {!loading && (inProgress || upNext) && (
        <div className="focus-card">
          <div className="focus-card-label">{inProgress ? "عم تكشف على" : "التالي"}</div>
          <div className="focus-card-name">{(inProgress ?? upNext)!.patient_name}</div>
          <div className="focus-card-meta">
            رقم {(inProgress ?? upNext)!.ticket_number} · سجّل حضور{" "}
            {clockTime((inProgress ?? upNext)!.checked_in_at, day?.queues[0]?.branch_timezone)}
          </div>
          <div className="focus-card-actions">
            {inProgress ? (
              <button className="btn-primary" disabled={busyTicket === inProgress.id} onClick={() => act(inProgress.id, "complete")}>
                خلّصت الكشف
              </button>
            ) : (
              <>
                {upNext!.status === "waiting" && (
                  <button className="btn-primary" disabled={busyTicket === upNext!.id} onClick={() => act(upNext!.id, "call")}>
                    نادي المريض
                  </button>
                )}
                <button className="btn-primary" disabled={busyTicket === upNext!.id} onClick={() => act(upNext!.id, "start")}>
                  بلّشت الكشف
                </button>
                <button className="btn-secondary" disabled={busyTicket === upNext!.id} onClick={() => act(upNext!.id, "skip")}>
                  تخطّي
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {loading ? (
        <table className="data-table skeleton-table">
          <tbody>
            {Array.from({ length: 4 }).map((_, i) => (
              <tr key={i}>
                {Array.from({ length: 4 }).map((__, j) => (
                  <td key={j}>
                    <div className="skeleton-block" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ) : tickets.length === 0 ? (
        <p className="table-empty">
          {date === todayIso()
            ? "ما في حدا مسجّل حضور عندك لهلق. أول ما الاستقبال تسجّل مريض بيظهر هون."
            : "ما كان في طابور إلك بهاد اليوم."}
        </p>
      ) : (
        <div className="queue-board">
          {day!.queues.flatMap((q) =>
            q.tickets.map((t) => (
              <div key={t.id} className={`ticket-card ${ticketTone[t.status] ?? ""}`}>
                <div className="ticket-card-top">
                  <span className="ticket-number">{t.ticket_number}</span>
                  <span className={`badge ${queueStatusBadgeClass[t.status] ?? "inactive"}`}>{statusLabel[t.status]}</span>
                </div>
                <div className="ticket-patient">{t.patient_name}</div>
                <div className="ticket-meta">
                  {priorityLabel[t.priority_level] && <span>{priorityLabel[t.priority_level]}</span>}
                  <span>حضر {clockTime(t.checked_in_at, q.branch_timezone)}</span>
                  <span>{q.branch_name}</span>
                </div>
                {t.status !== "done" && t.status !== "skipped" && (
                  <div className="ticket-actions">
                    <button
                      type="button"
                      className="btn-primary"
                      disabled={busyTicket === t.id}
                      onClick={() => act(t.id, t.status === "in_progress" ? "complete" : "start")}
                    >
                      {t.status === "in_progress" ? "خلّصت" : "بلّش"}
                    </button>
                  </div>
                )}
              </div>
            )),
          )}
        </div>
      )}
    </div>
  );
}
