import { useState } from "react";
import type { FormEvent } from "react";
import { forgotPassword, login, verifyMfa } from "../api/auth";
import type { StaffMe } from "../api/auth";
import { setToken } from "../api/client";

export function LoginPage({ onLoggedIn }: { onLoggedIn: (staff: StaffMe) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotMessage, setForgotMessage] = useState<string | null>(null);
  const [forgotSaving, setForgotSaving] = useState(false);

  const handleForgotPassword = (e: FormEvent) => {
    e.preventDefault();
    setForgotSaving(true);
    setForgotMessage(null);
    forgotPassword(forgotEmail)
      .then((result) => setForgotMessage(result.message))
      .catch((err) => setForgotMessage(err.response?.data?.detail ?? err.message))
      .finally(() => setForgotSaving(false));
  };

  const handleLogin = (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    login(email, password)
      .then((result) => {
        if (result.mfa_required && result.mfa_token) {
          setMfaToken(result.mfa_token);
        } else if (result.access_token && result.staff) {
          setToken(result.access_token);
          onLoggedIn(result.staff);
        }
      })
      .catch((err) => setError(err.response?.data?.detail ?? err.message))
      .finally(() => setSaving(false));
  };

  const handleMfaVerify = (e: FormEvent) => {
    e.preventDefault();
    if (!mfaToken) return;
    setSaving(true);
    setError(null);
    verifyMfa(mfaToken, mfaCode)
      .then((result) => {
        if (result.access_token && result.staff) {
          setToken(result.access_token);
          onLoggedIn(result.staff);
        }
      })
      .catch((err) => setError(err.response?.data?.detail ?? err.message))
      .finally(() => setSaving(false));
  };

  if (showForgotPassword) {
    return (
      <div className="setup-shell" dir="rtl">
        <form className="setup-card" onSubmit={handleForgotPassword}>
          <div className="setup-brand">
            <span className="brand-mark">ع</span>
            <span>لوحة العيادة</span>
          </div>
          <h1>نسيت كلمة المرور</h1>
          <p className="setup-lede">
            هيوصلك رابط إعادة تعيين كلمة المرور على بوت تليجرام (لو حسابك مربوط به).
          </p>

          {forgotMessage && <p>{forgotMessage}</p>}

          <div className="setup-section">
            <h2>الإيميل</h2>
            <input
              type="email"
              placeholder="الإيميل"
              value={forgotEmail}
              onChange={(e) => setForgotEmail(e.target.value)}
              autoFocus
              required
            />
          </div>

          <button type="submit" disabled={forgotSaving}>
            {forgotSaving ? "..." : "ابعت رابط إعادة التعيين"}
          </button>
          <button
            type="button"
            onClick={() => {
              setShowForgotPassword(false);
              setForgotMessage(null);
            }}
          >
            رجوع لتسجيل الدخول
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="setup-shell" dir="rtl">
      <form className="setup-card" onSubmit={mfaToken ? handleMfaVerify : handleLogin}>
        <div className="setup-brand">
          <span className="brand-mark">ع</span>
          <span>لوحة العيادة</span>
        </div>
        <h1>{mfaToken ? "التحقق بخطوتين" : "تسجيل الدخول"}</h1>
        <p className="setup-lede">
          {mfaToken ? "أدخل الرمز من تطبيق المصادقة الخاص بك" : "سجّل الدخول لمتابعة العمل على لوحة العيادة"}
        </p>

        {error && <p className="error">{error}</p>}

        {mfaToken ? (
          <div className="setup-section">
            <h2>رمز التحقق</h2>
            <input
              placeholder="000000"
              value={mfaCode}
              onChange={(e) => setMfaCode(e.target.value)}
              maxLength={6}
              autoFocus
              required
            />
          </div>
        ) : (
          <div className="setup-section">
            <h2>بيانات الدخول</h2>
            <input
              type="email"
              placeholder="الإيميل"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
              required
            />
            <input
              type="password"
              placeholder="كلمة المرور"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
        )}

        <button type="submit" disabled={saving}>
          {saving ? "..." : mfaToken ? "تحقق وادخل" : "دخول"}
        </button>
        {!mfaToken && (
          <button type="button" className="link-button" onClick={() => setShowForgotPassword(true)}>
            نسيت كلمة المرور؟
          </button>
        )}
      </form>
    </div>
  );
}
