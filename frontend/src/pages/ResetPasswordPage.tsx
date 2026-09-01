import { useState } from "react";
import type { FormEvent } from "react";
import { resetPassword } from "../api/auth";

export function ResetPasswordPage({ token, onDone }: { token: string; onDone: () => void }) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setError("كلمتا المرور غير متطابقتين");
      return;
    }
    setSaving(true);
    setError(null);
    resetPassword(token, newPassword)
      .then(() => setDone(true))
      .catch((err) => setError(err.response?.data?.detail ?? err.message))
      .finally(() => setSaving(false));
  };

  if (done) {
    return (
      <div className="setup-shell" dir="rtl">
        <div className="setup-card">
          <div className="setup-brand">
            <span className="brand-mark">ع</span>
            <span>لوحة العيادة</span>
          </div>
          <h1>تم تغيير كلمة المرور</h1>
          <p className="setup-lede">تقدر تسجّل الدخول دلوقتي بكلمة المرور الجديدة.</p>
          <button type="button" onClick={onDone}>
            تسجيل الدخول
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="setup-shell" dir="rtl">
      <form className="setup-card" onSubmit={handleSubmit}>
        <div className="setup-brand">
          <span className="brand-mark">ع</span>
          <span>لوحة العيادة</span>
        </div>
        <h1>إعادة تعيين كلمة المرور</h1>
        <p className="setup-lede">اختار كلمة مرور جديدة لحسابك.</p>

        {error && <p className="error">{error}</p>}

        <div className="setup-section">
          <h2>كلمة المرور الجديدة</h2>
          <input
            type="password"
            placeholder="كلمة المرور الجديدة"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoFocus
            required
            minLength={8}
          />
          <input
            type="password"
            placeholder="تأكيد كلمة المرور"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={8}
          />
        </div>

        <button type="submit" disabled={saving}>
          {saving ? "..." : "تغيير كلمة المرور"}
        </button>
      </form>
    </div>
  );
}
