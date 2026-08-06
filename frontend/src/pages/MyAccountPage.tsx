import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import QRCode from "qrcode";
import { changePassword, confirmMfa, disableMfa, getMe, setupMfa } from "../api/auth";
import type { StaffMe } from "../api/auth";

type MyAccountPageProps = {
  onBack: () => void;
};

type MfaSetupState = {
  secret: string;
  otpauth_url: string;
  qrDataUrl: string;
};

export function MyAccountPage({ onBack }: MyAccountPageProps) {
  const [staff, setStaff] = useState<StaffMe | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordNotice, setPasswordNotice] = useState<string | null>(null);

  const [mfaSetup, setMfaSetup] = useState<MfaSetupState | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [mfaBusy, setMfaBusy] = useState(false);
  const [mfaError, setMfaError] = useState<string | null>(null);

  const loadStaff = () => {
    getMe()
      .then(setStaff)
      .catch((err) => setLoadError(err.response?.data?.detail ?? err.message));
  };

  useEffect(loadStaff, []);

  const handleChangePassword = (e: FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordNotice(null);
    if (newPassword.length < 8) {
      setPasswordError("كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError("كلمة المرور الجديدة وتأكيدها غير متطابقين");
      return;
    }
    setPasswordSaving(true);
    changePassword(oldPassword, newPassword)
      .then(() => {
        setPasswordNotice("تم تغيير كلمة المرور بنجاح.");
        setOldPassword("");
        setNewPassword("");
        setConfirmPassword("");
      })
      .catch((err) => setPasswordError(err.response?.data?.detail ?? err.message))
      .finally(() => setPasswordSaving(false));
  };

  const startMfaSetup = () => {
    setMfaError(null);
    setMfaBusy(true);
    setupMfa()
      .then(async (result) => {
        const qrDataUrl = await QRCode.toDataURL(result.otpauth_url);
        setMfaSetup({ ...result, qrDataUrl });
      })
      .catch((err) => setMfaError(err.response?.data?.detail ?? err.message))
      .finally(() => setMfaBusy(false));
  };

  const handleConfirmMfa = (e: FormEvent) => {
    e.preventDefault();
    if (!mfaCode.trim()) return;
    setMfaError(null);
    setMfaBusy(true);
    confirmMfa(mfaCode.trim())
      .then(() => {
        setMfaSetup(null);
        setMfaCode("");
        loadStaff();
      })
      .catch((err) => setMfaError(err.response?.data?.detail ?? err.message))
      .finally(() => setMfaBusy(false));
  };

  const handleDisableMfa = () => {
    if (!window.confirm("متأكد إنك بدك توقف المصادقة الثنائية؟ هاد بيقلل حماية حسابك.")) return;
    setMfaError(null);
    setMfaBusy(true);
    disableMfa()
      .then(() => loadStaff())
      .catch((err) => setMfaError(err.response?.data?.detail ?? err.message))
      .finally(() => setMfaBusy(false));
  };

  return (
    <div className="page">
      <button className="btn-secondary" onClick={onBack} style={{ marginBottom: 16 }}>
        → رجوع
      </button>
      <h1 style={{ marginBottom: 8 }}>حسابي</h1>
      {loadError && <p className="error">{loadError}</p>}
      {staff && (
        <p className="settings-hint">
          {staff.full_name} — <span dir="ltr">{staff.email}</span>
        </p>
      )}

      <h2 style={{ fontSize: 16, marginBottom: 8 }}>تغيير كلمة المرور</h2>
      {passwordError && <p className="error">{passwordError}</p>}
      {passwordNotice && <p className="settings-hint">{passwordNotice}</p>}
      <form className="settings-form" onSubmit={handleChangePassword} style={{ maxWidth: 480 }}>
        <label>
          كلمة المرور الحالية
          <input type="password" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} required />
        </label>
        <label>
          كلمة المرور الجديدة
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            minLength={8}
            required
          />
        </label>
        <label>
          تأكيد كلمة المرور الجديدة
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            minLength={8}
            required
          />
        </label>
        <button type="submit" disabled={passwordSaving}>
          {passwordSaving ? "..." : "تغيير كلمة المرور"}
        </button>
      </form>

      <h2 style={{ fontSize: 16, margin: "24px 0 8px" }}>المصادقة الثنائية (MFA)</h2>
      {mfaError && <p className="error">{mfaError}</p>}

      {!staff ? null : staff.mfa_enabled ? (
        <div className="settings-form" style={{ maxWidth: 480 }}>
          <p style={{ color: "var(--success, #1a7f37)" }}>✅ المصادقة الثنائية مفعّلة على حسابك.</p>
          <button className="btn-secondary" onClick={handleDisableMfa} disabled={mfaBusy}>
            إيقاف المصادقة الثنائية
          </button>
        </div>
      ) : mfaSetup ? (
        <div className="settings-form" style={{ maxWidth: 480 }}>
          <p className="settings-hint">
            افتحي تطبيق مصادقة (Google Authenticator أو Authy) وامسحي الرمز، أو أدخلي المفتاح يدوياً إذا ما
            قدرتِ تمسحي:
          </p>
          <img src={mfaSetup.qrDataUrl} alt="رمز QR للمصادقة الثنائية" style={{ width: 200, height: 200 }} />
          <p dir="ltr" style={{ fontFamily: "monospace", userSelect: "all" }}>
            {mfaSetup.secret}
          </p>
          <form onSubmit={handleConfirmMfa} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <label>
              رمز التحقق من التطبيق
              <input
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value)}
                placeholder="123456"
                dir="ltr"
                autoFocus
              />
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="submit" disabled={mfaBusy || !mfaCode.trim()}>
                تأكيد وتفعيل
              </button>
              <button type="button" className="btn-secondary" onClick={() => setMfaSetup(null)}>
                إلغاء
              </button>
            </div>
          </form>
        </div>
      ) : (
        <div className="settings-form" style={{ maxWidth: 480 }}>
          <p className="settings-hint">
            فعّلي المصادقة الثنائية لحماية إضافية — بتحتاجي رمز من تطبيق مصادقة إضافة لكلمة المرور عند تسجيل
            الدخول.
          </p>
          <button onClick={startMfaSetup} disabled={mfaBusy}>
            {mfaBusy ? "..." : "تفعيل المصادقة الثنائية"}
          </button>
        </div>
      )}
    </div>
  );
}
