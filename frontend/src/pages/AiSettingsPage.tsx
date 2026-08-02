import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { getAiProviderSettings, updateAiProviderSettings } from "../api/aiSettings";
import type { AiProviderSettings } from "../api/aiSettings";

export function AiSettingsPage() {
  const [settings, setSettings] = useState<AiProviderSettings | null>(null);
  const [openaiKey, setOpenaiKey] = useState("");
  const [geminiKey, setGeminiKey] = useState("");
  const [geminiModel, setGeminiModel] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    getAiProviderSettings()
      .then((s) => {
        setSettings(s);
        setGeminiModel(s.gemini_model ?? "");
      })
      .catch((err) => setError(err.response?.data?.detail ?? err.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleSave = (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setError(null);
    const payload: { openai_api_key?: string; gemini_api_key?: string; gemini_model?: string } = {};
    if (openaiKey.trim()) payload.openai_api_key = openaiKey.trim();
    if (geminiKey.trim()) payload.gemini_api_key = geminiKey.trim();
    if (geminiModel.trim() !== (settings?.gemini_model ?? "")) payload.gemini_model = geminiModel.trim();
    updateAiProviderSettings(payload)
      .then((s) => {
        setSettings(s);
        setOpenaiKey("");
        setGeminiKey("");
        setSaved(true);
      })
      .catch((err) => setError(err.response?.data?.detail ?? err.message))
      .finally(() => setSaving(false));
  };

  const clearKey = (field: "openai_api_key" | "gemini_api_key") => {
    setSaving(true);
    setSaved(false);
    setError(null);
    updateAiProviderSettings({ [field]: "" })
      .then((s) => {
        setSettings(s);
        setSaved(true);
      })
      .catch((err) => setError(err.response?.data?.detail ?? err.message))
      .finally(() => setSaving(false));
  };

  if (loading) return <div className="page">جاري التحميل...</div>;

  return (
    <div className="page">
      {error && <p className="error">{error}</p>}
      <p className="settings-hint">
        مفاتيح مزوّدي الذكاء الاصطناعي المستخدمة بالرد الآلي على المرضى. اتركي الحقل فاضي وبس احفظي عشان
        يضل المفتاح الحالي كما هو. Gemini بيُستخدم فقط كبديل احتياطي تلقائي لما OpenAI يفشل (رصيد منتهي،
        انقطاع مؤقت...) — ما إله علاقة بالرد نفسه إذا OpenAI شغال طبيعي.
      </p>
      <form className="settings-form" onSubmit={handleSave}>
        <label>
          مفتاح OpenAI{settings?.openai_api_key_masked && ` (الحالي: ${settings.openai_api_key_masked})`}
          <input
            type="password"
            value={openaiKey}
            onChange={(e) => setOpenaiKey(e.target.value)}
            placeholder={settings?.openai_api_key_masked ? "اتركه فاضي للإبقاء على الحالي" : "sk-..."}
            autoComplete="off"
          />
          {settings?.openai_api_key_masked && (
            <button type="button" onClick={() => clearKey("openai_api_key")} disabled={saving}>
              إزالة المفتاح
            </button>
          )}
        </label>
        <label>
          مفتاح Gemini (احتياطي){settings?.gemini_api_key_masked && ` (الحالي: ${settings.gemini_api_key_masked})`}
          <input
            type="password"
            value={geminiKey}
            onChange={(e) => setGeminiKey(e.target.value)}
            placeholder={settings?.gemini_api_key_masked ? "اتركه فاضي للإبقاء على الحالي" : "AQ...."}
            autoComplete="off"
          />
          {settings?.gemini_api_key_masked && (
            <button type="button" onClick={() => clearKey("gemini_api_key")} disabled={saving}>
              إزالة المفتاح
            </button>
          )}
        </label>
        <label>
          موديل Gemini
          <input value={geminiModel} onChange={(e) => setGeminiModel(e.target.value)} placeholder="gemini-2.0-flash" />
        </label>
        <button type="submit" disabled={saving}>
          {saving ? "..." : "حفظ"}
        </button>
        {saved && <span className="settings-saved">✓ انحفظ</span>}
      </form>
      {settings && <p className="settings-updated">آخر تحديث: {new Date(settings.updated_at).toLocaleString("ar-JO")}</p>}
    </div>
  );
}
