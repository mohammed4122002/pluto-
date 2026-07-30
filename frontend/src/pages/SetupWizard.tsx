import { useState } from "react";
import type { FormEvent } from "react";
import { completeSetup } from "../api/setup";

export function SetupWizard({ onDone }: { onDone: () => void }) {
  const [clinicName, setClinicName] = useState("");
  const [branchName, setBranchName] = useState("");
  const [branchAddress, setBranchAddress] = useState("");
  const [workingHours, setWorkingHours] = useState("");
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPhone, setAdminPhone] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit =
    clinicName.trim() && branchName.trim() && adminName.trim() && adminEmail.trim() && adminPassword.length >= 8;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    completeSetup({
      clinic_name: clinicName,
      branch: { name: branchName, address: branchAddress || undefined, working_hours_note: workingHours || undefined },
      admin: { full_name: adminName, email: adminEmail, phone: adminPhone || undefined, password: adminPassword },
    })
      .then(onDone)
      .catch((err) => setError(err.response?.data?.detail ?? err.message))
      .finally(() => setSaving(false));
  };

  return (
    <div className="setup-shell" dir="rtl">
      <form className="setup-card" onSubmit={handleSubmit}>
        <div className="setup-brand">
          <span className="brand-mark">ع</span>
          <span>لوحة العيادة</span>
        </div>
        <h1>خلّينا نجهّز عيادتك</h1>
        <p className="setup-lede">ثلاث خطوات بسيطة وبتصير جاهز تستخدم الداشبورد.</p>

        {error && <p className="error">{error}</p>}

        <div className="setup-section">
          <h2>1. اسم العيادة</h2>
          <input
            placeholder="مثلاً: عيادة الشفاء التخصصية"
            value={clinicName}
            onChange={(e) => setClinicName(e.target.value)}
            required
          />
        </div>

        <div className="setup-section">
          <h2>2. أول فرع</h2>
          <div className="setup-row">
            <input
              placeholder="اسم الفرع"
              value={branchName}
              onChange={(e) => setBranchName(e.target.value)}
              required
            />
            <input
              placeholder="العنوان (اختياري)"
              value={branchAddress}
              onChange={(e) => setBranchAddress(e.target.value)}
            />
          </div>
          <input
            placeholder="مواعيد الدوام (اختياري) — مثلاً: الأحد-الخميس 9ص-5م"
            value={workingHours}
            onChange={(e) => setWorkingHours(e.target.value)}
          />
        </div>

        <div className="setup-section">
          <h2>3. حساب المدير الأول</h2>
          <div className="setup-row">
            <input
              placeholder="الاسم الكامل"
              value={adminName}
              onChange={(e) => setAdminName(e.target.value)}
              required
            />
            <input
              type="email"
              placeholder="الإيميل"
              value={adminEmail}
              onChange={(e) => setAdminEmail(e.target.value)}
              required
            />
          </div>
          <input
            placeholder="الهاتف (اختياري)"
            value={adminPhone}
            onChange={(e) => setAdminPhone(e.target.value)}
          />
          <input
            type="password"
            placeholder="كلمة المرور (8 أحرف على الأقل) — لتسجيل الدخول لاحقاً"
            value={adminPassword}
            onChange={(e) => setAdminPassword(e.target.value)}
            minLength={8}
            required
          />
        </div>

        <button type="submit" disabled={!canSubmit || saving}>
          {saving ? "جاري الإعداد..." : "ابدأ استخدام الداشبورد"}
        </button>
      </form>
    </div>
  );
}
