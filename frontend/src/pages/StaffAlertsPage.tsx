import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { generateMyTelegramLinkCode } from "../api/staff";
import type { TelegramLinkCode } from "../api/staff";
import { getStaffBotSettings, removeStaffBotToken, setStaffBotToken } from "../api/staffBot";
import type { StaffBotSettings } from "../api/staffBot";

type StaffAlertsPageProps = {
  onBack: () => void;
};

export function StaffAlertsPage({ onBack }: StaffAlertsPageProps) {
  const [linkCode, setLinkCode] = useState<TelegramLinkCode | null>(null);
  const [generatingCode, setGeneratingCode] = useState(false);

  const [botSettings, setBotSettings] = useState<StaffBotSettings | null>(null);
  const [canManageBot, setCanManageBot] = useState(true);
  const [token, setToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getStaffBotSettings()
      .then(setBotSettings)
      .catch(() => setCanManageBot(false));
  }, []);

  const handleGenerateCode = () => {
    setGeneratingCode(true);
    generateMyTelegramLinkCode()
      .then(setLinkCode)
      .catch((err) => setError(err.response?.data?.detail ?? err.message))
      .finally(() => setGeneratingCode(false));
  };

  const handleSaveToken = (e: FormEvent) => {
    e.preventDefault();
    if (!token.trim()) return;
    setSaving(true);
    setError(null);
    setStaffBotToken(token.trim())
      .then((s) => {
        setBotSettings(s);
        setToken("");
      })
      .catch((err) => setError(err.response?.data?.detail ?? err.message))
      .finally(() => setSaving(false));
  };

  const handleRemoveToken = () => {
    removeStaffBotToken()
      .then(setBotSettings)
      .catch((err) => setError(err.response?.data?.detail ?? err.message));
  };

  return (
    <div className="page">
      <button className="btn-secondary" onClick={onBack} style={{ marginBottom: 16 }}>
        → رجوع
      </button>
      <h1 style={{ marginBottom: 8 }}>تنبيهات المحادثات المحوّلة</h1>
      <p className="settings-hint">
        لما محادثة تتحوّل تلقائياً لموظف (لأنها احتاجت رد بشري)، بتنبعثله رسالة تيليجرام فورية بدل ما ينتظر
        يفتح لوحة التحكم. الموظف بيقدر يرد مباشرة من تيليجرام وردّه بيوصل للمريض تلقائياً.
      </p>

      {error && <p className="error">{error}</p>}

      <h2>الخطوة 1: ربط حسابك الشخصي</h2>
      <p className="settings-hint">
        كل موظف بدّه يستلم تنبيهات لازم يربط حسابه هو بنفسه (مرة وحدة بس). اضغطي الزر، افتحي البوت
        بتيليجرام (اسألي مدير النظام عن اسمه لو ما تعرفينه)، وابعتيله الكود يلي رح يظهر.
      </p>
      {linkCode ? (
        <div className="settings-form" style={{ maxWidth: 420 }}>
          <p>
            ابعتي هالرسالة للبوت بتيليجرام:
            <br />
            <strong dir="ltr" style={{ fontSize: 18 }}>
              /start {linkCode.code}
            </strong>
          </p>
          <p className="settings-hint">الكود صالح 10 دقايق فقط.</p>
          <button onClick={handleGenerateCode} disabled={generatingCode}>
            {generatingCode ? "..." : "توليد كود جديد"}
          </button>
        </div>
      ) : (
        <button onClick={handleGenerateCode} disabled={generatingCode}>
          {generatingCode ? "..." : "توليد كود الربط"}
        </button>
      )}

      {canManageBot && (
        <>
          <h2 style={{ marginTop: 32 }}>الخطوة 2: ربط بوت التيليجرام (مرة وحدة، لمدير النظام)</h2>
          {botSettings?.configured ? (
            <div className="settings-form" style={{ maxWidth: 420 }}>
              <p>
                البوت مربوط: <strong dir="ltr">@{botSettings.username}</strong>
              </p>
              <button className="btn-secondary" onClick={handleRemoveToken}>
                فك الربط
              </button>
            </div>
          ) : (
            <form className="settings-form" onSubmit={handleSaveToken} style={{ maxWidth: 480 }}>
              <p className="settings-hint">
                1. افتحي محادثة مع <strong dir="ltr">@BotFather</strong> بتيليجرام.
                <br />
                2. ابعتيله <strong dir="ltr">/newbot</strong> واتبعي التعليمات (اسم البوت + username ينتهي بـ
                bot).
                <br />
                3. بيديكي رمز (token) طويل — الصقيه هون واحفظي.
              </p>
              <label>
                توكن البوت
                <input
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="123456789:AAExampleTokenFromBotFather"
                  dir="ltr"
                />
              </label>
              <button type="submit" disabled={saving}>
                {saving ? "..." : "ربط البوت"}
              </button>
            </form>
          )}

          <p className="settings-hint" style={{ marginTop: 16 }}>
            واتساب: مو مدعوم حالياً — ربط بوت واتساب يحتاج حساب Meta Business موثّق وموافقة مسبقة، عكس
            تيليجرام يلي بس محتاج توكن. ممكن نضيفه لاحقاً كخيار ثاني إذا حبيتوا.
          </p>
        </>
      )}
    </div>
  );
}
