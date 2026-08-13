import { useEffect, useState } from "react";
import { listBranches } from "../api/branches";
import type { Branch } from "../api/branches";
import { listPatients } from "../api/patients";
import type { Patient } from "../api/patients";
import { listStaffDirectory } from "../api/staff";
import type { StaffDirectoryEntry } from "../api/staff";
import { callTicket, completeTicket, listQueues, listQueueTickets, skipTicket, startTicket } from "../api/queue";
import type { Queue, QueueTicket } from "../api/queue";
import { arrivalStatusLabel, priorityLabel, queueStatusBadgeClass, queueStatusLabel as statusLabel } from "../statusLabels";

// Tone per ticket status, so the board reads at a glance the way a real
// clinic queue display does -- waiting patients warm/amber, someone actually
// being seen violet/teal, and closed-out tickets fading to neutral.
const ticketTone: Record<QueueTicket["status"], string> = {
  waiting: "tone-amber",
  called: "tone-violet",
  in_progress: "tone-teal",
  done: "",
  skipped: "tone-rose",
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function QueuePage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [doctors, setDoctors] = useState<StaffDirectoryEntry[]>([]);
  const [queues, setQueues] = useState<Queue[]>([]);
  const [selectedQueue, setSelectedQueue] = useState<string>("");
  const [tickets, setTickets] = useState<QueueTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadQueues = () => {
    setLoading(true);
    setError(null);
    // Scoped to today by default -- staff used to have to hunt through every
    // open queue ever created (yesterday's, the day before's...) to find
    // today's. Computed fresh on every load, so it's always "today" without
    // anyone having to pick a date.
    const today = todayIso();
    Promise.all([listBranches(), listPatients(), listStaffDirectory(), listQueues(undefined, today)])
      .then(([branchList, patientList, staffList, queueList]) => {
        setBranches(branchList);
        setPatients(patientList);
        setDoctors(staffList.filter((s) => s.role === "doctor"));
        setQueues(queueList);
        setSelectedQueue(queueList[0]?.id || "");
      })
      .catch((err) => setError(err.response?.data?.detail ?? err.message))
      .finally(() => setLoading(false));
  };

  useEffect(loadQueues, []);

  const loadTickets = () => {
    if (!selectedQueue) {
      setTickets([]);
      return;
    }
    listQueueTickets(selectedQueue)
      .then(setTickets)
      .catch((err) => setError(err.response?.data?.detail ?? err.message));
  };

  useEffect(loadTickets, [selectedQueue]);

  const nameOf = (list: { id: string; full_name?: string; name?: string }[], id: string | null) =>
    list.find((x) => x.id === id)?.full_name ?? list.find((x) => x.id === id)?.name ?? "—";

  const act = (fn: (id: string) => Promise<QueueTicket>, ticketId: string) => {
    fn(ticketId)
      .then(() => loadTickets())
      .catch((err) => setError(err.response?.data?.detail ?? err.message));
  };

  if (loading) return <div className="page"><p>جاري التحميل...</p></div>;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <p className="page-header-title">الطابور والانتظار</p>
          <p className="page-header-subtitle">
            الطابور يُنشأ تلقائياً عند أول تسجيل حضور لطبيب باليوم — لا حاجة لإنشائه يدوياً. سجّل الحضور من صفحة
            المواعيد.
          </p>
        </div>
      </div>
      {error && <p className="error">{error}</p>}

      {queues.length === 0 ? (
        <p className="section-empty">
          لا يوجد طابور نشط اليوم بعد — سيظهر هنا بعد أول تسجيل حضور.
        </p>
      ) : (
        <>
          <div className="tab-bar">
            {queues.map((q) => (
              <button
                key={q.id}
                className={selectedQueue === q.id ? "tab-btn active" : "tab-btn"}
                onClick={() => setSelectedQueue(q.id)}
              >
                {/* Each queue is scoped to one doctor at one branch on one day -- two
                    doctors at the same branch today means two tabs that look identical
                    without this, since branch+date alone can't tell them apart. */}
                {nameOf(branches, q.branch_id)} — {q.doctor_id ? nameOf(doctors, q.doctor_id) : "بدون طبيب محدد"}
              </button>
            ))}
          </div>

          {tickets.length === 0 ? (
            <p className="section-empty">لا يوجد أحد بالطابور حالياً.</p>
          ) : (
            <div className="queue-board">
              {tickets.map((t) => (
                <div key={t.id} className={`ticket-card ${ticketTone[t.status]}`}>
                  <div className="ticket-card-top">
                    <span className="ticket-number">{t.ticket_number}</span>
                    <span className={`badge ${queueStatusBadgeClass[t.status]}`}>{statusLabel[t.status]}</span>
                  </div>
                  <div className="ticket-patient">{nameOf(patients, t.patient_id)}</div>
                  <div className="ticket-meta">
                    <span>الأولوية: {priorityLabel[t.priority_level]}</span>
                    <span>الوصول: {t.arrival_status ? arrivalStatusLabel[t.arrival_status] : "—"}</span>
                  </div>
                  <div className="ticket-actions">
                    {t.status === "waiting" && (
                      <>
                        <button type="button" onClick={() => act(callTicket, t.id)}>نداء</button>
                        <button type="button" className="btn-primary" onClick={() => act(startTicket, t.id)}>بدء الكشف</button>
                        <button type="button" onClick={() => act(skipTicket, t.id)}>تخطي</button>
                      </>
                    )}
                    {t.status === "called" && (
                      <>
                        <button type="button" className="btn-primary" onClick={() => act(startTicket, t.id)}>بدء الكشف</button>
                        <button type="button" onClick={() => act(skipTicket, t.id)}>تخطي</button>
                      </>
                    )}
                    {t.status === "in_progress" && (
                      <button type="button" className="btn-primary" onClick={() => act(completeTicket, t.id)}>إنهاء الكشف</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
