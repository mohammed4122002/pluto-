import { useEffect, useState } from "react";
import { dismissPatientDuplicate, listPatientDuplicates, mergePatientDuplicate } from "../api/patients";
import type { PatientDuplicate } from "../api/patients";

const reasonLabels: Record<string, string> = {
  same_phone: "نفس رقم الهاتف",
  similar_name: "اسم متشابه",
  same_name_and_dob: "نفس الاسم وتاريخ الميلاد",
};

export function PatientDuplicatesPage() {
  const [duplicates, setDuplicates] = useState<PatientDuplicate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    listPatientDuplicates("pending")
      .then(setDuplicates)
      .catch((err) => setError(err.response?.data?.detail ?? err.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleMerge = (dup: PatientDuplicate, survivorId: string, survivorName: string | null) => {
    mergePatientDuplicate(dup.id, survivorId)
      .then(() => {
        setNotice(`تم الدمج — السجل الباقي: ${survivorName}`);
        setDuplicates((prev) => prev.filter((d) => d.id !== dup.id));
      })
      .catch((err) => setError(err.response?.data?.detail ?? err.message));
  };

  const handleDismiss = (dup: PatientDuplicate) => {
    dismissPatientDuplicate(dup.id)
      .then(() => setDuplicates((prev) => prev.filter((d) => d.id !== dup.id)))
      .catch((err) => setError(err.response?.data?.detail ?? err.message));
  };

  return (
    <div className="page">
      <p className="settings-hint">
        عند إضافة مريض جديد، يقارنه النظام تلقائياً بالمرضى الموجودين (بالهاتف والاسم وتاريخ الميلاد). الأزواج التي
        تتجاوز نسبة تشابه معينة تظهر هون لمراجعتك — إما دمجها بسجل واحد، أو تجاهلها إن لم تكونا نفس الشخص.
      </p>
      {error && <p className="error">{error}</p>}
      {notice && (
        <p className="settings-hint">
          {notice} <button onClick={() => setNotice(null)}>إخفاء</button>
        </p>
      )}

      {loading ? (
        <p>جاري التحميل...</p>
      ) : duplicates.length === 0 ? (
        <p className="inbox-empty">لا يوجد سجلات مكررة بانتظار المراجعة حالياً.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>السجل الأول</th>
              <th>السجل الثاني</th>
              <th>نسبة التطابق</th>
              <th>السبب</th>
              <th>الإجراء</th>
            </tr>
          </thead>
          <tbody>
            {duplicates.map((d) => (
              <tr key={d.id}>
                <td>
                  {d.patient_a_name}
                  <div className="import-hint">{d.patient_a_phone}</div>
                </td>
                <td>
                  {d.patient_b_name}
                  <div className="import-hint">{d.patient_b_phone}</div>
                </td>
                <td>{d.match_score}%</td>
                <td>{d.match_reasons.map((r) => reasonLabels[r] ?? r).join("، ")}</td>
                <td>
                  <button onClick={() => handleMerge(d, d.patient_a_id, d.patient_a_name)}>
                    دمج — الإبقاء على الأول
                  </button>
                  <button onClick={() => handleMerge(d, d.patient_b_id, d.patient_b_name)}>
                    دمج — الإبقاء على الثاني
                  </button>
                  <button onClick={() => handleDismiss(d)}>ليسا نفس الشخص</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
