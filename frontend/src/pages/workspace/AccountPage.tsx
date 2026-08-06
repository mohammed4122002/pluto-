import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { changePassword, confirmMfa, disableMfa, setupMfa } from "../../api/auth";
import type { MfaSetup, StaffMe } from "../../api/auth";
import { getMyTelegramBot, removeMyTelegramBotToken, setMyTelegramBotToken } from "../../api/staffBot";
import type { MyTelegramBotStatus } from "../../api/staffBot";
import { errorMessage } from "../../api/errors";

const roleLabel: Record<string, string> = {
  admin: "مدير",
  doctor: "طبيب",
  receptionist: "موظف استقبال",
};

/** Everything a staff member can change about their own account, in one place.
 * All three of these endpoints already existed and none of them had a screen —
 * changing a password meant asking an admin to reset it. */
export function AccountPage({ staff }: { staff: StaffMe }) {
  return (
    <div className="page">
      <div className="page-header">
        <div>
          <div className="page-header-title">حسابي</div>
          <div className="page-header-subtitle">
            {staff.full_name} · {roleLabel[staff.role] ?? staff.role} · <span dir="ltr">{staff.email}</span>
          </div>
        </div>
      </div>

      <div className="account-grid">
        <PasswordCard />
        <MfaCard initiallyEnabled={staff.mfa_enabled} />
        <TelegramBotCard />
      </div>
    </div>
  );
}

function PasswordCard() {
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setDone(false);
    if (newPassword.length < 8) return setError("كلمة المرور الجديدة لازم تكون 8 خانات على الأقل.");
    if (newPassword !== confirm) return setError("كلمتا المرور مش متطابقتين.");
    setSaving(true);
    changePassword(oldPassword, newPassword)
      .then(() => {
        setDone(true);
        setOldPassword("");
        setNewPassword("");
        setConfirm("");
      })
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setSaving(false));
  };

  return (
    <section className="account-card">
      <h2 className="account-card-title">كلمة المرور</h2>
      <p className="account-card-hint">غيّرها بنفسك — ما بدك ترجع للإدارة.</p>
      {error && <p className="error">{error}</p>}
      {done && <p className="success">تم تغيير كلمة المرور.</p>}
      <form className="account-form" onSubmit={submit}>
        <label>
          كلمة المرور الحالية
          <input type="password" value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} required />
        </label>
        <label>
          كلمة المرور الجديدة
          <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required />
        </label>
        <label>
          تأكيد كلمة المرور الجديدة
          <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
        </label>
        <button className="btn-primary" type="submit" disabled={saving}>
          {saving ? "..." : "حفظ"}
        </button>
      </form>
    </section>
  );
}

function MfaCard({ initiallyEnabled }: { initiallyEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initiallyEnabled);
  const [setup, setSetup] = useState<MfaSetup | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSecret, setShowSecret] = useState(false);

  const begin = () => {
    setBusy(true);
    setError(null);
    setupMfa()
      .then(setSetup)
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setBusy(false));
  };

  const confirmCode = (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    confirmMfa(code)
      .then(() => {
        setEnabled(true);
        setSetup(null);
        setCode("");
      })
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setBusy(false));
  };

  const turnOff = () => {
    setBusy(true);
    setError(null);
    disableMfa()
      .then(() => setEnabled(false))
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setBusy(false));
  };

  return (
    <section className="account-card">
      <h2 className="account-card-title">
        التحقق بخطوتين
        <span className={enabled ? "badge active" : "badge inactive"}>{enabled ? "مفعّل" : "غير مفعّل"}</span>
      </h2>
      <p className="account-card-hint">
        بيطلب منك رمز من تطبيق المصادقة كل مرة بتسجّل دخول — حتى لو حدا عرف كلمة السر ما بيقدر يدخل.
      </p>
      {error && <p className="error">{error}</p>}

      {enabled ? (
        <button className="btn-secondary" onClick={turnOff} disabled={busy}>
          إيقاف التحقق بخطوتين
        </button>
      ) : setup ? (
        <>
          <p className="account-card-hint">امسح الرمز بتطبيق Google Authenticator أو أي تطبيق مشابه:</p>
          <img className="mfa-qr" src={setup.qr_data_uri} alt="رمز QR لتفعيل التحقق بخطوتين" />
          <p className="account-card-hint">
            ما بتقدر تمسح؟{" "}
            <button type="button" className="link-button" onClick={() => setShowSecret((v) => !v)}>
              {showSecret ? "إخفاء الرمز" : "أدخل الرمز يدوياً"}
            </button>
          </p>
          {showSecret && (
            <code className="mfa-secret" dir="ltr">
              {setup.secret}
            </code>
          )}
          <form className="account-form" onSubmit={confirmCode}>
            <label>
              الرمز من التطبيق
              <input
                dir="ltr"
                inputMode="numeric"
                maxLength={6}
                placeholder="123456"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
              />
            </label>
            <button className="btn-primary" type="submit" disabled={busy || code.length < 6}>
              {busy ? "..." : "تأكيد وتفعيل"}
            </button>
          </form>
        </>
      ) : (
        <button className="btn-primary" onClick={begin} disabled={busy}>
          {busy ? "..." : "تفعيل التحقق بخطوتين"}
        </button>
      )}
    </section>
  );
}

/** The escalation bot. Was a loose sidebar link ("ربط بوت التنبيهات") that read
 * as a system-wide setting; it is personal configuration and belongs here. */
function TelegramBotCard() {
  const [status, setStatus] = useState<MyTelegramBotStatus | null>(null);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMyTelegramBot()
      .then(setStatus)
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  }, []);

  const save = (e: FormEvent) => {
    e.preventDefault();
    if (!token.trim()) return;
    setBusy(true);
    setError(null);
    setMyTelegramBotToken(token.trim())
      .then((s) => {
        setStatus(s);
        setToken("");
      })
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setBusy(false));
  };

  const unlink = () => {
    setBusy(true);
    setError(null);
    removeMyTelegramBotToken()
      .then(setStatus)
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setBusy(false));
  };

  return (
    <section className="account-card account-card-wide">
      <h2 className="account-card-title">
        بوت التنبيهات
        {status?.configured && (
          <span className={status.linked ? "badge active" : "badge inactive"}>
            {status.linked ? "مربوط" : "بانتظار /start"}
          </span>
        )}
      </h2>
      <p className="account-card-hint">
        لما المساعد الذكي يحوّللك محادثة لأنها بدها رد بشري، بيوصلك تنبيه فوري على تيليجرام فيه اسم المريض
        وآخر رسالة — وبتقدر ترد من هناك مباشرة والرد بيوصل للمريض، بدون ما تفتح اللوحة.
      </p>

      {error && <p className="error">{error}</p>}

      {loading ? (
        <div className="skeleton-block" style={{ height: 80 }} />
      ) : status?.configured ? (
        <>
          <p>
            بوتك: <strong dir="ltr">@{status.username}</strong>
          </p>
          {status.linked ? (
            <p className="success">حسابك مربوط — جاهز تستلم تنبيهات.</p>
          ) : (
            <p className="account-card-hint">
              بقيت خطوة وحدة: افتح البوت بتيليجرام وابعتله{" "}
              <strong dir="ltr">/start</strong>
            </p>
          )}
          <button className="btn-secondary" onClick={unlink} disabled={busy}>
            فك الربط
          </button>
        </>
      ) : (
        <>
          <ol className="account-steps">
            <li>
              افتح محادثة مع <strong dir="ltr">@BotFather</strong> بتيليجرام.
            </li>
            <li>
              ابعتله <strong dir="ltr">/newbot</strong> واتبع التعليمات (اسم البوت + username بينتهي بـ bot).
            </li>
            <li>بيعطيك رمز (token) طويل — الصقه هون.</li>
          </ol>
          <form className="account-form" onSubmit={save}>
            <label>
              توكن البوت
              <input
                type="password"
                dir="ltr"
                placeholder="123456789:AAExampleTokenFromBotFather"
                value={token}
                onChange={(e) => setToken(e.target.value)}
              />
            </label>
            <button className="btn-primary" type="submit" disabled={busy}>
              {busy ? "..." : "ربط البوت"}
            </button>
          </form>
        </>
      )}

      <p className="account-card-hint account-card-footnote">
        واتساب مو مدعوم حالياً — ربط بوت واتساب بدّه حساب Meta Business موثّق وموافقة مسبقة، عكس تيليجرام
        يلي بس بدّه توكن.
      </p>
    </section>
  );
}
