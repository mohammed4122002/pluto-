import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { getStaffBotSettings, removeStaffBotToken, setStaffBotToken } from "../api/staffBot";
import type { StaffBotSettings } from "../api/staffBot";

/** One-time, clinic-wide setup: an admin creates a single Telegram bot via
 * BotFather and links it here. After this, every staff member links their
 * own chat to it themselves from "حسابي" -- no BotFather, no admin
 * involvement per-person, ever again. */
export function StaffBotSettingsPage() {
  const [settings, setSettings] = useState<StaffBotSettings | null>(null);
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getStaffBotSettings()
      .then(setSettings)
      .catch((err) => setError(err.response?.data?.detail ?? err.message))
      .finally(() => setLoading(false));
  }, []);

  const save = (e: FormEvent) => {
    e.preventDefault();
    if (!token.trim()) return;
    setSaving(true);
    setError(null);
    setStaffBotToken(token.trim())
      .then((s) => {
        setSettings(s);
        setToken("");
      })
      .catch((err) => setError(err.response?.data?.detail ?? err.message))
      .finally(() => setSaving(false));
  };

  const remove = () => {
    setSaving(true);
    setError(null);
    removeStaffBotToken()
      .then(setSettings)
      .catch((err) => setError(err.response?.data?.detail ?? err.message))
      .finally(() => setSaving(false));
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <p className="page-header-title">بوت التنبيهات</p>
          <p className="page-header-subtitle">
            بوت تيليجرام واحد للعيادة كلها — تربطه مرة وحدة هون، وبعدها كل موظف بيربط حسابه بنفسه من صفحة
            "حسابي" بدون أي تدخل منك.
          </p>
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      {loading ? (
        <p>جاري التحميل...</p>
      ) : settings?.configured ? (
        <div className="data-form" style={{ flexDirection: "column", alignItems: "stretch", maxWidth: 480 }}>
          <p>
            البوت مربوط: <strong dir="ltr">@{settings.username}</strong>
          </p>
          <button onClick={remove} disabled={saving}>
            {saving ? "..." : "فك الربط"}
          </button>
        </div>
      ) : (
        <form className="data-form" onSubmit={save} style={{ flexDirection: "column", alignItems: "stretch", maxWidth: 520 }}>
          <ol style={{ paddingInlineStart: 20, lineHeight: 1.9 }}>
            <li>
              افتحي محادثة مع <strong dir="ltr">@BotFather</strong> بتيليجرام.
            </li>
            <li>
              ابعتيله <strong dir="ltr">/newbot</strong> واتبعي التعليمات (اسم البوت + username بينتهي بـ bot).
            </li>
            <li>بيديكي رمز (token) طويل — الصقيه هون.</li>
          </ol>
          <input
            type="password"
            dir="ltr"
            placeholder="123456789:AAExampleTokenFromBotFather"
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
          <button type="submit" disabled={saving}>
            {saving ? "..." : "ربط البوت"}
          </button>
        </form>
      )}

      <p className="settings-hint" style={{ marginTop: 16 }}>
        واتساب مو مدعوم حالياً — ربط بوت واتساب بدّه حساب Meta Business موثّق وموافقة مسبقة، عكس تيليجرام
        يلي بس بدّه توكن.
      </p>
    </div>
  );
}
