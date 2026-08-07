import { Fragment, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { addServiceDoctor, createService, listServices, removeServiceDoctor, updateService } from "../api/services";
import type { Service, ServiceCreate } from "../api/services";
import { listSpecialties } from "../api/specialties";
import type { Specialty } from "../api/specialties";
import { listStaffDirectory } from "../api/staff";
import type { StaffDirectoryEntry } from "../api/staff";

const emptyForm: ServiceCreate = {
  name: "",
  description: "",
  duration_minutes: 30,
  price: undefined,
  specialty_id: undefined,
  doctor_ids: [],
};

export function ServicesPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [specialties, setSpecialties] = useState<Specialty[]>([]);
  const [doctors, setDoctors] = useState<StaffDirectoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<ServiceCreate>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [openFor, setOpenFor] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const load = () => {
    setLoading(true);
    setError(null);
    Promise.all([listServices(), listSpecialties(), listStaffDirectory()])
      .then(([serviceList, specialtyList, staffList]) => {
        setServices(serviceList);
        setSpecialties(specialtyList);
        setDoctors(staffList.filter((s) => s.role === "doctor"));
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const q = search.trim().toLowerCase();
  const visibleServices = q ? services.filter((s) => s.name.toLowerCase().includes(q)) : services;

  const specialtyName = (id: string | null) => specialties.find((s) => s.id === id)?.name_ar ?? "—";
  const doctorNames = (ids: string[]) =>
    ids.map((id) => doctors.find((d) => d.id === id)?.full_name).filter(Boolean).join(", ") || "—";

  const toggleFormDoctor = (staffId: string) => {
    setForm((f) => ({
      ...f,
      doctor_ids: (f.doctor_ids ?? []).includes(staffId)
        ? (f.doctor_ids ?? []).filter((id) => id !== staffId)
        : [...(f.doctor_ids ?? []), staffId],
    }));
  };

  const handleCreate = (e: FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    createService(form)
      .then((service) => {
        setServices((prev) => [...prev, service].sort((a, b) => a.name.localeCompare(b.name)));
        setForm(emptyForm);
      })
      .catch((err) => setError(err.message))
      .finally(() => setSaving(false));
  };

  const toggleActive = (service: Service) => {
    updateService(service.id, { is_active: !service.is_active })
      .then((updated) => setServices((prev) => prev.map((s) => (s.id === service.id ? updated : s))))
      .catch((err) => setError(err.message));
  };

  const toggleServiceDoctor = (service: Service, staffId: string) => {
    setError(null);
    const action = service.doctor_ids.includes(staffId)
      ? removeServiceDoctor(service.id, staffId).then(() => ({
          ...service,
          doctor_ids: service.doctor_ids.filter((id) => id !== staffId),
        }))
      : addServiceDoctor(service.id, staffId);
    action
      .then((updated) => setServices((prev) => prev.map((s) => (s.id === service.id ? updated : s))))
      .catch((err) => setError(err.message));
  };

  const activeCount = services.filter((s) => s.is_active).length;

  return (
    <div className="page">
      {error && <p className="error">{error}</p>}

      <div className="page-header">
        <div>
          <p className="page-header-title">الخدمات</p>
          <p className="page-header-subtitle">كتالوج الخدمات، أسعارها، ومدتها، والأطباء المسؤولين عنها.</p>
        </div>
      </div>

      {!loading && (
        <div className="stat-grid">
          <div className="stat-card">
            <div className="stat-card-value">{services.length}</div>
            <div className="stat-card-label">إجمالي الخدمات</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-value">{activeCount}</div>
            <div className="stat-card-label">فعّالة</div>
          </div>
        </div>
      )}

    <form className="data-form" onSubmit={handleCreate}>
      <input
        placeholder="اسم الخدمة"
        value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
        required
      />
      <input
        placeholder="الوصف"
        value={form.description}
        onChange={(e) => setForm({ ...form, description: e.target.value })}
      />
      <input
        type="number"
        placeholder="المدة (دقيقة)"
        value={form.duration_minutes}
        onChange={(e) => setForm({ ...form, duration_minutes: Number(e.target.value) })}
      />
      <input
        type="number"
        placeholder="السعر"
        value={form.price ?? ""}
        onChange={(e) => setForm({ ...form, price: e.target.value ? Number(e.target.value) : undefined })}
      />
      <select
        value={form.specialty_id ?? ""}
        onChange={(e) => setForm({ ...form, specialty_id: e.target.value || undefined })}
      >
        <option value="">بدون تخصص محدد</option>
        {specialties.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name_ar}
          </option>
        ))}
      </select>
      <button type="submit" disabled={saving}>
        {saving ? "..." : "إضافة خدمة"}
      </button>
    </form>

      {doctors.length > 0 && (
        <div className="checkbox-group">
          {doctors.map((d) => (
            <label key={d.id}>
              <input
                type="checkbox"
                checked={(form.doctor_ids ?? []).includes(d.id)}
                onChange={() => toggleFormDoctor(d.id)}
              />
              {d.full_name}
            </label>
          ))}
        </div>
      )}

      {!loading && services.length > 0 && (
        <div className="table-toolbar">
          <div className="search-input">
            <input placeholder="بحث باسم الخدمة..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>
      )}

      {loading ? (
        <table className="data-table skeleton-table">
          <tbody>
            {Array.from({ length: 5 }).map((_, i) => (
              <tr key={i}>
                {Array.from({ length: 8 }).map((__, j) => (
                  <td key={j}>
                    <div className="skeleton-block" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>الاسم</th>
              <th>الوصف</th>
              <th>المدة</th>
              <th>السعر</th>
              <th>التخصص</th>
              <th>الأطباء المسؤولون</th>
              <th>الحالة</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {visibleServices.map((service) => (
              <Fragment key={service.id}>
                <tr>
                  <td>{service.name}</td>
                  <td>{service.description}</td>
                  <td>{service.duration_minutes} د</td>
                  <td>{service.price ?? "—"}</td>
                  <td>{specialtyName(service.specialty_id)}</td>
                  <td>{doctorNames(service.doctor_ids)}</td>
                  <td>
                    <span className={service.is_active ? "badge active" : "badge inactive"}>
                      {service.is_active ? "فعّال" : "متوقف"}
                    </span>
                  </td>
                  <td>
                    {/* service.update isn't in the doctor role's grant -- read-only for them. */}
                    <>
                      <button onClick={() => setOpenFor(openFor === service.id ? null : service.id)}>
                        {openFor === service.id ? "إخفاء" : "الأطباء"}
                      </button>
                      <button onClick={() => toggleActive(service)}>
                        {service.is_active ? "إيقاف" : "تفعيل"}
                      </button>
                    </>
                  </td>
                </tr>
                {openFor === service.id && (
                  <tr>
                    <td colSpan={8}>
                      <div className="checkbox-group">
                        {doctors.map((d) => (
                          <label key={d.id}>
                            <input
                              type="checkbox"
                              checked={service.doctor_ids.includes(d.id)}
                              onChange={() => toggleServiceDoctor(service, d.id)}
                            />
                            {d.full_name}
                          </label>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {visibleServices.length === 0 && (
              <tr>
                <td colSpan={8} className="table-empty">
                  ما في خدمات مطابقة للبحث.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
