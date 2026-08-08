import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { changePassword, confirmMfa, disableMfa, setupMfa } from "../../api/auth";
import type { MfaSetup, StaffMe } from "../../api/auth";
import { generateMyTelegramLinkCode, getMyTelegramLink } from "../../api/staffBot";
import type { TelegramLinkCode, TelegramLinkStatus } from "../../api/staffBot";
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

/** The escalation bot -- one shared clinic bot (an admin configures it once,
 * see "بوت التنبيهات" under إعدادات العيادة). Linking your own chat to it is
 * self-service and needs nobody else's involvement, hence living here. */
function TelegramBotCard() {
  const [status, setStatus] = useState<TelegramLinkStatus | null>(null);
  const [linkCode, setLinkCode] = useState<TelegramLinkCode | null>(null);
  const [generating, setGenerating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMyTelegramLink()
      .then(setStatus)
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  }, []);

  const generate = () => {
    setGenerating(true);
    setError(null);
    generateMyTelegramLinkCode()
      .then(setLinkCode)
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setGenerating(false));
  };

  return (
    <section className="account-card account-card-wide">
      <h2 className="account-card-title">
        بوت التنبيهات
        {status && (
          <span className={status.linked ? "badge active" : "badge inactive"}>
            {status.linked ? "مربوط" : "غير مربوط"}
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
      ) : status?.linked ? (
        <p className="success">حسابك مربوط — جاهز تستلم تنبيهات.</p>
      ) : !status?.bot_username ? (
        <p className="account-card-hint">بوت التنبيهات لسا ما انربط من مدير النظام — اسألي/اسأل مدير النظام يربطه من إعدادات العيادة.</p>
      ) : linkCode ? (
        <>
          <p className="account-card-hint">افتحي البوت بتيليجرام واضغطي "بدء" (Start):</p>
          <a
            className="btn-primary"
            style={{ display: "inline-block", textDecoration: "none", textAlign: "center" }}
            href={`https://t.me/${linkCode.bot_username}?start=${linkCode.code}`}
            target="_blank"
            rel="noreferrer"
          >
            فتح البوت بتيليجرام
          </a>
          <p className="account-card-hint">
            أو يدوياً بعتي: <strong dir="ltr">/start {linkCode.code}</strong> — الكود صالح 10 دقايق.
          </p>
          <button className="btn-secondary" onClick={generate} disabled={generating}>
            {generating ? "..." : "توليد كود جديد"}
          </button>
        </>
      ) : (
        <button className="btn-primary" onClick={generate} disabled={generating}>
          {generating ? "..." : "ربط حسابي"}
        </button>
      )}
    </section>
  );
}
