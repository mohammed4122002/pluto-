import { useEffect, useMemo, useState } from "react";
import { getMyPatients } from "../../api/me";
import type { MyPatient } from "../../api/me";
import { errorMessage } from "../../api/errors";

const tagLabel: Record<string, string> = {
  vip: "VIP",
  chronic: "حالة مزمنة",
  high_risk: "خطورة عالية",
  no_show_risk: "كتير بيتغيّب",
  insurance: "تأمين",
};

const avatarColors = ["#7c5cff", "#ff8a3d", "#22b07d", "#e5484d", "#0ea5b0", "#c026d3", "#f59e0b"];
function avatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return avatarColors[Math.abs(hash) % avatarColors.length];
}

function shortDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("ar", { year: "numeric", month: "short", day: "numeric" });
}

export function MyPatientsPage() {
  const [patients, setPatients] = useState<MyPatient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    getMyPatients()
      .then(setPatients)
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  }, []);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return patients;
    return patients.filter((p) => p.full_name.toLowerCase().includes(q) || p.phone.includes(q));
  }, [patients, search]);

  const withUpcoming = patients.filter((p) => p.next_appointment_at).length;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-header-title">مرضاي</div>
          <div className="page-header-subtitle">
            المرضى يلي عندك معهم مواعيد — عدد الزيارات وآخر زيارة محسوبين من مواعيدك إنت بس.
          </div>
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      {!loading && patients.length > 0 && (
        <>
          <div className="stat-grid">
            <div className="stat-card">
              <div className="stat-card-value">{patients.length}</div>
              <div className="stat-card-label">مريض إلك</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-value">{withUpcoming}</div>
              <div className="stat-card-label">عندهم موعد قادم</div>
            </div>
          </div>
          <div className="table-toolbar">
            <div className="search-input">
              <input
                placeholder="ابحث بالاسم أو الهاتف..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </>
      )}

      {loading ? (
        <table className="data-table skeleton-table">
          <tbody>
            {Array.from({ length: 6 }).map((_, i) => (
              <tr key={i}>
                {Array.from({ length: 5 }).map((__, j) => (
                  <td key={j}>
                    <div className="skeleton-block" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ) : patients.length === 0 ? (
        <p className="table-empty">لسا ما عندك مرضى — أول ما ينحجزلك موعد بيظهر المريض هون.</p>
      ) : visible.length === 0 ? (
        <p className="table-empty">ما في مريض مطابق للبحث.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>الاسم</th>
              <th>الهاتف</th>
              <th>الزيارات</th>
              <th>آخر زيارة</th>
              <th>الموعد القادم</th>
              <th>ملاحظات</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((p) => (
              <tr key={p.id}>
                <td>
                  <div className="avatar-row">
                    <span className="avatar" style={{ background: avatarColor(p.full_name) }}>
                      {p.full_name.replace(/^د\.\s*/, "").trim()[0] ?? ""}
                    </span>
                    <span>
                      {p.full_name}
                      {p.tags.map((t) => (
                        <span key={t} className="badge inactive" style={{ marginInlineStart: 6 }}>
                          {tagLabel[t] ?? t}
                        </span>
                      ))}
                    </span>
                  </div>
                </td>
                <td dir="ltr">{p.phone}</td>
                <td>{p.visits_count}</td>
                <td>{shortDate(p.last_visit_at)}</td>
                <td>{p.next_appointment_at ? shortDate(p.next_appointment_at) : "—"}</td>
                <td>{p.notes ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
