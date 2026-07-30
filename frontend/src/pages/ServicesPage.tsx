import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { createService, listServices, updateService } from "../api/services";
import type { Service, ServiceCreate } from "../api/services";

const emptyForm: ServiceCreate = { name: "", description: "", duration_minutes: 30, price: undefined };

export function ServicesPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<ServiceCreate>(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    setError(null);
    listServices()
      .then(setServices)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

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

  return (
    <div className="page">
      {error && <p className="error">{error}</p>}

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
        <button type="submit" disabled={saving}>
          {saving ? "..." : "إضافة خدمة"}
        </button>
      </form>

      {loading ? (
        <p>جاري التحميل...</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>الاسم</th>
              <th>الوصف</th>
              <th>المدة</th>
              <th>السعر</th>
              <th>الحالة</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {services.map((service) => (
              <tr key={service.id}>
                <td>{service.name}</td>
                <td>{service.description}</td>
                <td>{service.duration_minutes} د</td>
                <td>{service.price ?? "—"}</td>
                <td>
                  <span className={service.is_active ? "badge active" : "badge inactive"}>
                    {service.is_active ? "فعّال" : "متوقف"}
                  </span>
                </td>
                <td>
                  <button onClick={() => toggleActive(service)}>
                    {service.is_active ? "إيقاف" : "تفعيل"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
