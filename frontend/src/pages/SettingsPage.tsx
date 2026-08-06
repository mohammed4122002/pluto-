import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { getClinicSettings, updateClinicSettings } from "../api/settings";
import type { ClinicSettings } from "../api/settings";

export function SettingsPage() {
  const [settings, setSettings] = useState<ClinicSettings | null>(null);
  const [clinicName, setClinicName] = useState("");
  const [aboutText, setAboutText] = useState("");
  const [minLeadMinutes, setMinLeadMinutes] = useState(0);
  const [maxAdvanceDays, setMaxAdvanceDays] = useState(90);
  const [sameDayCutoff, setSameDayCutoff] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    getClinicSettings()
      .then((s) => {
        setSettings(s);
        setClinicName(s.clinic_name);
        setAboutText(s.about_text);
        setMinLeadMinutes(s.min_booking_lead_minutes);
        setMaxAdvanceDays(s.max_booking_advance_days);
        setSameDayCutoff(s.same_day_cutoff_time ?? "");
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    updateClinicSettings({
      clinic_name: clinicName,
      about_text: aboutText,
      min_booking_lead_minutes: minLeadMinutes,
      max_booking_advance_days: maxAdvanceDays,
      same_day_cutoff_time: sameDayCutoff || null,
    })
      .then((s) => {
        setSettings(s);
        setSaved(true);
      })
      .catch((err) => setError(err.message))
      .finally(() => setSaving(false));
  };

  if (loading) return <div className="page">جاري التحميل...</div>;

  return (
    <div className="page">
      {error && <p className="error">{error}</p>}
      <div className="page-header">
        <div>
          <p className="page-header-title">إعدادات العيادة</p>
          <p className="page-header-subtitle">
            هاي المعلومات بيستخدمها الذكاء الاصطناعي مباشرة لما يرد على المرضى — مواعيد الدوام والخدمات
            بتنجاب تلقائياً من شاشتي "الفروع" و"الخدمات"، وهون بس معلومات عامة إضافية (سياسات، تأمين،
            ملاحظات...).
          </p>
        </div>
      </div>
      <form className="settings-form" onSubmit={handleSave}>
        <label>
          اسم العيادة
          <input value={clinicName} onChange={(e) => setClinicName(e.target.value)} />
        </label>
        <label>
          معلومات عامة عن العيادة
          <textarea
            rows={8}
            value={aboutText}
            onChange={(e) => setAboutText(e.target.value)}
            placeholder="مثلاً: نقبل تأمين كذا وكذا، الدفع كاش أو بطاقة، يوجد موقف سيارات..."
          />
        </label>
        <label>
          الحد الأدنى قبل الموعد (بالدقائق)
          <input
            type="number"
            min={0}
            value={minLeadMinutes}
            onChange={(e) => setMinLeadMinutes(Number(e.target.value))}
          />
        </label>
        <label>
          أقصى مدة يقدر المريض يحجز فيها مسبقاً (بالأيام)
          <input
            type="number"
            min={1}
            value={maxAdvanceDays}
            onChange={(e) => setMaxAdvanceDays(Number(e.target.value))}
          />
        </label>
        <label>
          وقت إغلاق حجوزات نفس اليوم (اختياري)
          <input type="time" value={sameDayCutoff} onChange={(e) => setSameDayCutoff(e.target.value)} />
        </label>
        <p className="settings-hint">
          هاي القيود بتنطبق بس على حجز المريض عبر الشات (AI) — موظفي الاستقبال يقدروا يحجزوا خارج هاي
          الحدود عند الحاجة.
        </p>
        <button type="submit" disabled={saving}>
          {saving ? "..." : "حفظ"}
        </button>
        {saved && <span className="settings-saved">✓ انحفظ</span>}
      </form>
      {settings && (
        <p className="settings-updated">آخر تحديث: {new Date(settings.updated_at).toLocaleString("ar-JO")}</p>
      )}
    </div>
  );
}
