import { useEffect, useState } from "react";
import { getMyServices } from "../../api/me";
import type { MyService } from "../../api/me";
import { errorMessage } from "../../api/errors";

export function MyServicesPage() {
  const [services, setServices] = useState<MyService[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    getMyServices()
      .then(setServices)
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  }, []);

  const q = search.trim().toLowerCase();
  const visible = q ? services.filter((s) => s.name.toLowerCase().includes(q)) : services;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-header-title">خدماتي</div>
          <div className="page-header-subtitle">الخدمات المربوطة فيك، ومدّة وسعر كل وحدة.</div>
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      {!loading && services.length > 0 && (
        <>
          <div className="stat-grid">
            <div className="stat-card">
              <div className="stat-card-value">{services.length}</div>
              <div className="stat-card-label">خدمة مربوطة فيك</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-value">{services.reduce((sum, s) => sum + s.upcoming_appointments, 0)}</div>
              <div className="stat-card-label">مواعيد قادمة عليها</div>
            </div>
          </div>
          <div className="table-toolbar">
            <div className="search-input">
              <input placeholder="ابحث بالاسم..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
        </>
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
      ) : services.length === 0 ? (
        // Distinct from "no search results" on purpose — an empty catalogue
        // here means an admin never linked this doctor to a service, and the
        // doctor can't fix that themselves.
        <p className="table-empty">ما في خدمات مربوطة فيك بعد — تواصل مع الإدارة ليربطولك خدماتك.</p>
      ) : visible.length === 0 ? (
        <p className="table-empty">ما في خدمة بهاد الاسم.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>الخدمة</th>
              <th>التخصص</th>
              <th>المدة</th>
              <th>السعر</th>
              <th>مواعيد قادمة</th>
              <th>الحالة</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((s) => (
              <tr key={s.id}>
                <td>
                  <strong>{s.name}</strong>
                  {s.description && <div className="page-header-subtitle">{s.description}</div>}
                </td>
                <td>{s.specialty_name ?? "—"}</td>
                <td>{s.duration_minutes} د</td>
                <td>{s.price != null ? s.price : "—"}</td>
                <td>{s.upcoming_appointments}</td>
                <td>
                  <span className={s.is_active ? "badge active" : "badge inactive"}>
                    {s.is_active ? "فعّالة" : "موقوفة"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
