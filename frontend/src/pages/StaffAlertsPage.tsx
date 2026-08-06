import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { getMyTelegramBot, removeMyTelegramBotToken, setMyTelegramBotToken } from "../api/staffBot";
import type { MyTelegramBotStatus } from "../api/staffBot";

type StaffAlertsPageProps = {
  onBack: () => void;
};

export function StaffAlertsPage({ onBack }: StaffAlertsPageProps) {
  const [status, setStatus] = useState<MyTelegramBotStatus | null>(null);
  const [token, setToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getMyTelegramBot()
      .then(setStatus)
      .catch((err) => setError(err.response?.data?.detail ?? err.message))
      .finally(() => setLoading(false));
  }, []);

  const handleSaveToken = (e: FormEvent) => {
    e.preventDefault();
    if (!token.trim()) return;
    setSaving(true);
    setError(null);
    setMyTelegramBotToken(token.trim())
      .then((s) => {
        setStatus(s);
        setToken("");
      })
      .catch((err) => setError(err.response?.data?.detail ?? err.message))
      .finally(() => setSaving(false));
  };

  const handleRemoveToken = () => {
    removeMyTelegramBotToken()
      .then(setStatus)
      .catch((err) => setError(err.response?.data?.detail ?? err.message));
  };

  return (
    <div className="page">
      <button className="btn-secondary" onClick={onBack} style={{ marginBottom: 16 }}>
        → رجوع
      </button>
      <h1 style={{ marginBottom: 8 }}>تنبيهات المحادثات المحوّلة</h1>
      <p className="settings-hint">
        لما محادثة تتحوّل تلقائياً إلك (لأنها احتاجت رد بشري)، بيوصلك تنبيه فوري ببوت تيليجرام خاص فيك —
        فيه اسم المريض وآخر رسالة. بتقدر ترد مباشرة من تيليجرام وردّك بيوصل للمريض تلقائياً، بدل ما تنتظر
        تفتح لوحة التحكم.
      </p>

      {error && <p className="error">{error}</p>}

      {loading ? (
        <p>جاري التحميل...</p>
      ) : status?.configured ? (
        <div className="settings-form" style={{ maxWidth: 480 }}>
          <p>
            بوتك: <strong dir="ltr">@{status.username}</strong>
          </p>
          {status.linked ? (
            <p style={{ color: "var(--success, #1a7f37)" }}>✅ حسابك مربوط — جاهز تستلم تنبيهات.</p>
          ) : (
            <>
              <p className="settings-hint">بقي خطوة وحدة: افتحي البوت بتيليجرام وابعتيله:</p>
              <p>
                <strong dir="ltr" style={{ fontSize: 18 }}>
                  /start
                </strong>
              </p>
            </>
          )}
          <button className="btn-secondary" onClick={handleRemoveToken}>
            فك الربط
          </button>
        </div>
      ) : (
        <form className="settings-form" onSubmit={handleSaveToken} style={{ maxWidth: 480 }}>
          <p className="settings-hint">
            كل موظف بيعمل بوت خاص فيه (مرة وحدة، ياخد دقيقتين):
            <br />
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
    </div>
  );
}
