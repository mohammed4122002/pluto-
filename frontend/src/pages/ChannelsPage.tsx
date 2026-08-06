import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { listBranches } from "../api/branches";
import type { Branch } from "../api/branches";
import {
  checkChannelHealthNow,
  createChannel,
  createRoutingRule,
  deleteChannel,
  deleteRoutingRule,
  getChannelHealth,
  getChannelSettings,
  listChannels,
  listRoutingRules,
  recentChannelMessages,
  rotateChannelCredentials,
  sendTestMessage,
  updateChannel,
  updateChannelSettings,
  verifyChannelCredentials,
} from "../api/channels";
import type {
  Channel,
  ChannelHealthCheck,
  ChannelSettings,
  ChannelSettingsUpdate,
  ChannelType,
  Message,
  RoutingRule,
  VerifyCredentialsResult,
} from "../api/channels";

const channelLabel: Record<ChannelType, string> = {
  whatsapp: "واتساب",
  telegram: "تيليجرام",
  instagram: "إنستجرام",
  messenger: "ماسنجر",
  twilio: "Twilio",
  web: "دردشة الموقع",
};

const channelIcon: Record<ChannelType, string> = {
  whatsapp: "💬",
  telegram: "✈️",
  instagram: "📷",
  messenger: "💬",
  twilio: "☎️",
  web: "🌐",
};

const healthLabel: Record<ChannelHealthCheck["status"], string> = {
  healthy: "متصلة",
  degraded: "تحذير",
  failed: "متوقفة",
  not_connected: "غير متصلة",
};

function relativeTime(iso: string | null): string {
  if (!iso) return "لا يوجد بعد";
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "الآن";
  if (mins < 60) return `منذ ${mins} دقيقة`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `منذ ${hours} ساعة`;
  const days = Math.round(hours / 24);
  return `منذ ${days} يوم`;
}

function healthReason(h: ChannelHealthCheck | undefined): string {
  if (!h) return "جاري الفحص...";
  if (h.error_message) return h.error_message;
  if (h.status === "healthy") return `آخر رسالة استُلمت ${relativeTime(h.last_inbound_at)}`;
  if (h.status === "not_connected") return "لم يتم تفعيل القناة بعد";
  return healthLabel[h.status];
}

type ProviderField = { key: string; label: string; secret?: boolean; hint: string; link?: string };

const PROVIDER_FIELDS: Record<ChannelType, ProviderField[]> = {
  telegram: [
    {
      key: "bot_token",
      label: "توكن البوت (Bot Token)",
      secret: true,
      hint: "احصل عليه من BotFather على تيليجرام: أرسل /mybots ثم اختر بوتك ثم API Token.",
      link: "https://t.me/BotFather",
    },
  ],
  whatsapp: [
    {
      key: "phone_number_id",
      label: "معرّف رقم الهاتف (Phone Number ID)",
      hint: "من لوحة Meta for Developers، داخل تطبيقك تحت WhatsApp > API Setup.",
      link: "https://developers.facebook.com/apps",
    },
    {
      key: "waba_id",
      label: "معرّف حساب واتساب للأعمال (WABA ID)",
      hint: "من نفس صفحة API Setup — حقل WhatsApp Business Account ID.",
    },
    {
      key: "access_token",
      label: "توكن النظام (System User Access Token)",
      secret: true,
      hint: "⚠️ استخدم توكن System User وليس توكن مستخدم عادي — توكن المستخدم العادي ينتهي خلال 60 يوماً تقريباً فيتوقف البوت فجأة دون تفسير. أنشئه من إعدادات الأعمال > مستخدمو النظام.",
      link: "https://business.facebook.com/settings/system-users",
    },
  ],
  twilio: [
    {
      key: "account_sid",
      label: "Account SID",
      hint: "من لوحة تحكم Twilio الرئيسية أعلى الصفحة.",
      link: "https://console.twilio.com",
    },
    { key: "auth_token", label: "Auth Token", secret: true, hint: "بجانب Account SID في نفس الصفحة — اضغط Show لإظهاره." },
    { key: "from_number", label: "رقم المرسل أو Messaging Service SID", hint: "الرقم الذي اشتريته من Twilio أو معرّف خدمة المراسلة." },
  ],
  instagram: [
    {
      key: "page_access_token",
      label: "توكن صفحة فيسبوك (Page Access Token)",
      secret: true,
      hint: "من Meta for Developers، لصفحة فيسبوك المربوطة بحساب انستقرام للأعمال.",
      link: "https://developers.facebook.com/apps",
    },
    { key: "ig_business_account_id", label: "معرّف حساب انستقرام للأعمال (IG Business Account ID)", hint: "من نفس لوحة الإعداد تحت Instagram Graph API." },
  ],
  messenger: [
    { key: "page_id", label: "معرّف صفحة فيسبوك (Page ID)", hint: "من إعدادات صفحتك على فيسبوك > عن > معرّف الصفحة." },
    {
      key: "page_access_token",
      label: "توكن الصفحة (Page Access Token)",
      secret: true,
      hint: "من Meta for Developers ضمن إعداد Messenger للتطبيق.",
      link: "https://developers.facebook.com/apps",
    },
  ],
  web: [],
};

type View = { mode: "list" } | { mode: "add" } | { mode: "settings"; channelId: string };

export function ChannelsPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [health, setHealth] = useState<Record<string, ChannelHealthCheck>>({});
  const [aiEnabled, setAiEnabled] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<View>({ mode: "list" });

  const load = () => {
    setLoading(true);
    setError(null);
    Promise.all([listBranches(), listChannels()])
      .then(([branchList, channelList]) => {
        setBranches(branchList);
        setChannels(channelList);
        channelList.forEach((ch) => {
          getChannelHealth(ch.id)
            .then((h) => setHealth((prev) => ({ ...prev, [ch.id]: h })))
            .catch(() => {});
          getChannelSettings(ch.id)
            .then((s) => setAiEnabled((prev) => ({ ...prev, [ch.id]: s.ai_enabled })))
            .catch(() => {});
        });
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const branchName = (id: string) => branches.find((b) => b.id === id)?.name ?? id;

  const renameChannel = (channel: Channel, name: string) => {
    setChannels((prev) => prev.map((c) => (c.id === channel.id ? { ...c, display_name: name } : c)));
  };

  const commitRename = (channel: Channel) => {
    if (!channel.display_name.trim()) return;
    updateChannel(channel.id, { display_name: channel.display_name }).catch((err) => setError(err.message));
  };

  const toggleActive = (channel: Channel) => {
    updateChannel(channel.id, { is_active: !channel.is_active })
      .then((updated) => setChannels((prev) => prev.map((c) => (c.id === channel.id ? updated : c))))
      .catch((err) => setError(err.message));
  };

  const toggleAi = (channel: Channel) => {
    const next = !aiEnabled[channel.id];
    setAiEnabled((prev) => ({ ...prev, [channel.id]: next }));
    updateChannelSettings(channel.id, { ai_enabled: next }).catch((err) => setError(err.message));
  };

  const refreshHealth = (channel: Channel) => {
    checkChannelHealthNow(channel.id)
      .then((h) => setHealth((prev) => ({ ...prev, [channel.id]: h })))
      .catch((err) => setError(err.message));
  };

  const removeChannel = (channel: Channel) => {
    if (
      !window.confirm(
        `سيتم إيقاف قناة "${channel.display_name}" وحذف بيانات الاتصال بها. المحادثات السابقة تبقى محفوظة ولن تُحذف. هل تريد المتابعة؟`,
      )
    )
      return;
    deleteChannel(channel.id)
      .then(() => setChannels((prev) => prev.filter((c) => c.id !== channel.id)))
      .catch((err) => setError(err.message));
  };

  const testMessage = (channel: Channel) => {
    if (channel.channel_type === "web") {
      window.alert("قناة الموقع تُختبر مباشرة من أداة الدردشة على موقعك.");
      return;
    }
    const recipient = window.prompt(
      channel.channel_type === "telegram"
        ? "أدخل معرّف محادثة تيليجرام (chat id) لإرسال رسالة اختبار إليه:"
        : "أدخل رقم الهاتف أو معرّف المستلم لإرسال رسالة اختبار إليه:",
    );
    if (!recipient) return;
    sendTestMessage(channel.id, recipient)
      .then((res) => window.alert(res.sent ? "تم إرسال رسالة الاختبار بنجاح." : `فشل الإرسال: ${res.error}`))
      .catch((err) => setError(err.message));
  };

  if (view.mode === "add") {
    return (
      <AddChannelWizard
        branches={branches}
        onCancel={() => setView({ mode: "list" })}
        onCreated={(channel) => {
          setChannels((prev) => [...prev, channel]);
          setAiEnabled((prev) => ({ ...prev, [channel.id]: true }));
          setView({ mode: "list" });
        }}
      />
    );
  }

  if (view.mode === "settings") {
    const channel = channels.find((c) => c.id === view.channelId);
    if (!channel) {
      setView({ mode: "list" });
      return null;
    }
    return (
      <ChannelSettingsPanel
        channel={channel}
        branches={branches}
        onBack={() => setView({ mode: "list" })}
        onUpdated={(updated) => setChannels((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))}
      />
    );
  }

  if (branches.length === 0 && !loading) {
    return (
      <div className="page">
        <p>لازم تضيف فرع أول قبل ما تربط قناة تواصل.</p>
      </div>
    );
  }

  return (
    <div className="page">
      {error && <p className="error">{error}</p>}

      <div className="channels-toolbar">
        <button className="btn-primary" onClick={() => setView({ mode: "add" })}>
          + إضافة قناة
        </button>
      </div>

      {loading ? (
        <p>جاري التحميل...</p>
      ) : channels.length === 0 ? (
        <p>لا توجد قنوات مربوطة بعد.</p>
      ) : (
        <div className="channel-grid">
          {channels.map((channel) => {
            const h = health[channel.id];
            return (
              <div key={channel.id} className="channel-card">
                <div className="channel-card-head">
                  <div className="channel-icon">{channelIcon[channel.channel_type]}</div>
                  <div className="channel-card-title">
                    <input
                      className="channel-name-input"
                      dir="auto"
                      value={channel.display_name}
                      onChange={(e) => renameChannel(channel, e.target.value)}
                      onBlur={() => commitRename(channel)}
                    />
                    <div className="channel-card-sub">
                      {channelLabel[channel.channel_type]} · {branchName(channel.branch_id)}
                    </div>
                  </div>
                </div>

                <div className="channel-health">
                  <span className={`health-dot ${h?.status ?? "not_connected"}`} />
                  <span>
                    {healthLabel[h?.status ?? "not_connected"]} — {healthReason(h)}
                  </span>
                </div>

                <div className="channel-card-toggle">
                  <span>المساعد الذكي</span>
                  <button className="btn-secondary" onClick={() => toggleAi(channel)}>
                    {aiEnabled[channel.id] ? "مفعّل" : "متوقف"}
                  </button>
                </div>

                <div className="channel-card-actions">
                  <button onClick={() => setView({ mode: "settings", channelId: channel.id })}>الإعدادات</button>
                  <button onClick={() => refreshHealth(channel)}>اختبار الاتصال</button>
                  <button onClick={() => testMessage(channel)}>إرسال رسالة اختبار</button>
                  <button onClick={() => toggleActive(channel)}>{channel.is_active ? "إيقاف" : "تفعيل"}</button>
                  <button className="danger" onClick={() => removeChannel(channel)}>
                    حذف
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AddChannelWizard({
  branches,
  onCancel,
  onCreated,
}: {
  branches: Branch[];
  onCancel: () => void;
  onCreated: (channel: Channel) => void;
}) {
  const [type, setType] = useState<ChannelType | null>(null);
  const [branchId, setBranchId] = useState(branches[0]?.id ?? "");
  const [displayName, setDisplayName] = useState("");
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<VerifyCredentialsResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const providerTypes: ChannelType[] = ["whatsapp", "telegram", "instagram", "messenger", "twilio", "web"];

  const setField = (key: string, value: string) => {
    setCredentials((prev) => ({ ...prev, [key]: value }));
    setVerifyResult(null);
  };

  const handleVerify = () => {
    if (!type) return;
    setVerifying(true);
    setError(null);
    verifyChannelCredentials(type, credentials)
      .then(setVerifyResult)
      .catch((err) => setError(err.response?.data?.detail ?? err.message))
      .finally(() => setVerifying(false));
  };

  const handleSave = (e: FormEvent) => {
    e.preventDefault();
    if (!type || !branchId || !displayName.trim()) return;
    if (type !== "web" && !verifyResult?.valid) return;
    setSaving(true);
    setError(null);
    createChannel({ branch_id: branchId, channel_type: type, display_name: displayName, credentials })
      .then(onCreated)
      .catch((err) => setError(err.response?.data?.detail ?? err.message))
      .finally(() => setSaving(false));
  };

  if (!type) {
    return (
      <div className="page">
        <button className="panel-back" onClick={onCancel}>
          → رجوع
        </button>
        <h2 style={{ marginBottom: 16 }}>اختر نوع القناة</h2>
        <div className="provider-picker">
          {providerTypes.map((t) => (
            <button key={t} className="provider-option" onClick={() => setType(t)}>
              <span className="channel-icon">{channelIcon[t]}</span>
              {channelLabel[t]}
            </button>
          ))}
        </div>
      </div>
    );
  }

  const fields = PROVIDER_FIELDS[type];
  const canVerify = fields.every((f) => credentials[f.key]?.trim());

  return (
    <div className="page">
      <button className="panel-back" onClick={() => setType(null)}>
        → رجوع
      </button>
      <h2 style={{ marginBottom: 16 }}>
        إضافة قناة {channelLabel[type]}
      </h2>
      {error && <p className="error">{error}</p>}

      <form className="field-group" onSubmit={handleSave}>
        <div className="field-row">
          <label>اسم القناة (يظهر للفريق)</label>
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="مثلاً: واتساب الاستقبال" required />
        </div>

        <div className="field-row">
          <label>الفرع</label>
          <select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>

        {fields.map((f) => (
          <div className="field-row" key={f.key}>
            <label>{f.label}</label>
            <input
              type={f.secret ? "password" : "text"}
              value={credentials[f.key] ?? ""}
              onChange={(e) => setField(f.key, e.target.value)}
              required
            />
            <p className="field-hint">
              {f.hint}
              {f.link && (
                <>
                  {" "}
                  <a href={f.link} target="_blank" rel="noreferrer">
                    فتح الرابط
                  </a>
                </>
              )}
            </p>
          </div>
        ))}

        {fields.length > 0 && (
          <div className="verify-row">
            <button type="button" className="btn-secondary" onClick={handleVerify} disabled={!canVerify || verifying}>
              {verifying ? "جاري التحقق..." : "تحقق"}
            </button>
            {verifyResult && (
              <span className={`verify-result ${verifyResult.valid ? "ok" : "fail"}`}>
                {verifyResult.valid ? "✓ تم التحقق بنجاح" : `✗ ${verifyResult.error}`}
              </span>
            )}
          </div>
        )}

        <button className="btn-primary" type="submit" disabled={saving || (fields.length > 0 && !verifyResult?.valid) || !displayName.trim()}>
          {saving ? "جاري الحفظ..." : "حفظ القناة"}
        </button>
      </form>
    </div>
  );
}

const TABS = [
  { key: "general", label: "عام" },
  { key: "ai", label: "المساعد الذكي" },
  { key: "hours", label: "ساعات العمل" },
  { key: "escalation", label: "التصعيد" },
  { key: "connection", label: "الاتصال" },
  { key: "health", label: "الصحة والتشخيص" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function ChannelSettingsPanel({
  channel,
  branches,
  onBack,
  onUpdated,
}: {
  channel: Channel;
  branches: Branch[];
  onBack: () => void;
  onUpdated: (channel: Channel) => void;
}) {
  const [tab, setTab] = useState<TabKey>("general");
  const [settings, setSettings] = useState<ChannelSettings | null>(null);
  const [rules, setRules] = useState<RoutingRule[]>([]);
  const [health, setHealth] = useState<ChannelHealthCheck | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    getChannelSettings(channel.id).then(setSettings).catch((err) => setError(err.message));
    listRoutingRules(channel.id).then(setRules).catch(() => {});
    getChannelHealth(channel.id).then(setHealth).catch(() => {});
    recentChannelMessages(channel.id).then(setMessages).catch(() => {});
  }, [channel.id]);

  const saveSettings = (patch: ChannelSettingsUpdate) => {
    setError(null);
    updateChannelSettings(channel.id, patch)
      .then((s) => {
        setSettings(s);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      })
      .catch((err) => setError(err.response?.data?.detail ?? err.message));
  };

  return (
    <div className="page">
      <button className="panel-back" onClick={onBack}>
        → رجوع لقائمة القنوات
      </button>
      <h2 style={{ marginBottom: 4 }} dir="auto">
        {channel.display_name}
      </h2>
      <p className="settings-hint">{channelLabel[channel.channel_type]}</p>

      {error && <p className="error">{error}</p>}

      <div className="tab-bar">
        {TABS.map((t) => (
          <button key={t.key} className={`tab-btn ${tab === t.key ? "active" : ""}`} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "general" && (
        <GeneralTab channel={channel} branches={branches} onUpdated={onUpdated} />
      )}

      {tab === "ai" && settings && (
        <AiTab settings={settings} onSave={saveSettings} saved={saved} />
      )}

      {tab === "hours" && settings && (
        <HoursTab settings={settings} onSave={saveSettings} saved={saved} />
      )}

      {tab === "escalation" && (
        <EscalationTab
          settings={settings}
          rules={rules}
          onSaveSettings={saveSettings}
          saved={saved}
          onAddRule={(rule) =>
            createRoutingRule(channel.id, rule)
              .then((created) => setRules((prev) => [...prev, created]))
              .catch((err) => setError(err.response?.data?.detail ?? err.message))
          }
          onDeleteRule={(ruleId) =>
            deleteRoutingRule(channel.id, ruleId)
              .then(() => setRules((prev) => prev.filter((r) => r.id !== ruleId)))
              .catch((err) => setError(err.message))
          }
        />
      )}

      {tab === "connection" && (
        <ConnectionTab
          channel={channel}
          onRotated={onUpdated}
          onError={(msg) => setError(msg)}
        />
      )}

      {tab === "health" && <HealthTab health={health} messages={messages} />}
    </div>
  );
}

function GeneralTab({
  channel,
  branches,
  onUpdated,
}: {
  channel: Channel;
  branches: Branch[];
  onUpdated: (channel: Channel) => void;
}) {
  const [name, setName] = useState(channel.display_name);
  const [branchId, setBranchId] = useState(channel.branch_id);
  const [saved, setSaved] = useState(false);

  const save = (e: FormEvent) => {
    e.preventDefault();
    updateChannel(channel.id, { display_name: name, branch_id: branchId }).then((updated) => {
      onUpdated(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  };

  return (
    <form className="settings-form" onSubmit={save}>
      <label>
        اسم القناة
        <input dir="auto" value={name} onChange={(e) => setName(e.target.value)} required />
      </label>
      <label>
        الفرع
        <select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        الحالة
        <select
          value={channel.is_active ? "active" : "inactive"}
          onChange={(e) => updateChannel(channel.id, { is_active: e.target.value === "active" }).then(onUpdated)}
        >
          <option value="active">مفعّلة</option>
          <option value="inactive">متوقفة</option>
        </select>
      </label>
      <button type="submit">حفظ</button>
      {saved && <span className="settings-saved">تم الحفظ</span>}
    </form>
  );
}

function AiTab({
  settings,
  onSave,
  saved,
}: {
  settings: ChannelSettings;
  onSave: (patch: ChannelSettingsUpdate) => void;
  saved: boolean;
}) {
  const [form, setForm] = useState(settings);

  useEffect(() => setForm(settings), [settings]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSave({
      ai_enabled: form.ai_enabled,
      ai_mode: form.ai_mode,
      greeting_message: form.greeting_message,
      language: form.language,
      dialect: form.dialect,
      tone: form.tone,
      max_ai_turns_before_human: form.max_ai_turns_before_human,
      handoff_message: form.handoff_message,
    });
  };

  return (
    <form className="settings-form" onSubmit={submit}>
      <label>
        تفعيل المساعد الذكي
        <select value={form.ai_enabled ? "on" : "off"} onChange={(e) => setForm({ ...form, ai_enabled: e.target.value === "on" })}>
          <option value="on">مفعّل</option>
          <option value="off">متوقف</option>
        </select>
      </label>
      <label>
        وضع المساعد
        <select value={form.ai_mode} onChange={(e) => setForm({ ...form, ai_mode: e.target.value as ChannelSettings["ai_mode"] })}>
          <option value="full_booking">حجز كامل (يقدر يحجز ويعدّل مواعيد)</option>
          <option value="inquiry_only">استفسارات فقط (بدون حجز)</option>
          <option value="greeting_only">ترحيب فقط ثم تحويل لموظف</option>
        </select>
      </label>
      <label>
        رسالة الترحيب
        <textarea rows={2} value={form.greeting_message ?? ""} onChange={(e) => setForm({ ...form, greeting_message: e.target.value })} />
      </label>
      <label>
        اللغة
        <select value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })}>
          <option value="ar">عربي</option>
          <option value="en">إنجليزي</option>
        </select>
      </label>
      <label>
        اللهجة (اختياري)
        <input value={form.dialect ?? ""} onChange={(e) => setForm({ ...form, dialect: e.target.value })} placeholder="مثلاً: شامي، خليجي" />
      </label>
      <label>
        أسلوب الرد
        <select
          value={form.tone ?? ""}
          onChange={(e) => setForm({ ...form, tone: (e.target.value || null) as ChannelSettings["tone"] })}
        >
          <option value="">ودود عامي (الافتراضي)</option>
          <option value="formal">رسمي مهني</option>
        </select>
      </label>
      <label>
        أقصى عدد ردود قبل التحويل الإجباري لموظف
        <input
          type="number"
          min={1}
          value={form.max_ai_turns_before_human}
          onChange={(e) => setForm({ ...form, max_ai_turns_before_human: Number(e.target.value) })}
        />
      </label>
      <label>
        رسالة التحويل للموظف
        <textarea rows={2} value={form.handoff_message ?? ""} onChange={(e) => setForm({ ...form, handoff_message: e.target.value })} />
      </label>
      <button type="submit">حفظ</button>
      {saved && <span className="settings-saved">تم الحفظ</span>}
    </form>
  );
}

function HoursTab({
  settings,
  onSave,
  saved,
}: {
  settings: ChannelSettings;
  onSave: (patch: ChannelSettingsUpdate) => void;
  saved: boolean;
}) {
  const [outsideEnabled, setOutsideEnabled] = useState(settings.auto_reply_outside_hours);
  const [message, setMessage] = useState(settings.outside_hours_message ?? "");

  useEffect(() => {
    setOutsideEnabled(settings.auto_reply_outside_hours);
    setMessage(settings.outside_hours_message ?? "");
  }, [settings]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSave({ auto_reply_outside_hours: outsideEnabled, outside_hours_message: message });
  };

  return (
    <form className="settings-form" onSubmit={submit}>
      <p className="settings-hint">
        ساعات العمل التفصيلية لكل يوم تُدار من إعدادات الفرع العامة. هنا تتحكم فقط بسلوك القناة خارج الدوام.
      </p>
      <label>
        الرد التلقائي خارج ساعات الدوام
        <select value={outsideEnabled ? "on" : "off"} onChange={(e) => setOutsideEnabled(e.target.value === "on")}>
          <option value="on">مفعّل</option>
          <option value="off">متوقف</option>
        </select>
      </label>
      <label>
        نص الرد خارج الدوام
        <textarea rows={2} value={message} onChange={(e) => setMessage(e.target.value)} />
      </label>
      <button type="submit">حفظ</button>
      {saved && <span className="settings-saved">تم الحفظ</span>}
    </form>
  );
}

function EscalationTab({
  settings,
  rules,
  onSaveSettings,
  saved,
  onAddRule,
  onDeleteRule,
}: {
  settings: ChannelSettings | null;
  rules: RoutingRule[];
  onSaveSettings: (patch: ChannelSettingsUpdate) => void;
  saved: boolean;
  onAddRule: (rule: { keyword: string; action: RoutingRule["action"]; auto_reply_text?: string }) => void;
  onDeleteRule: (ruleId: string) => void;
}) {
  const [keywords, setKeywords] = useState(settings?.escalation_keywords.join(", ") ?? "");
  const [newKeyword, setNewKeyword] = useState("");
  const [newAction, setNewAction] = useState<RoutingRule["action"]>("escalate");

  useEffect(() => setKeywords(settings?.escalation_keywords.join(", ") ?? ""), [settings]);

  const submitKeywords = (e: FormEvent) => {
    e.preventDefault();
    onSaveSettings({ escalation_keywords: keywords.split(",").map((k) => k.trim()).filter(Boolean) });
  };

  const addRule = (e: FormEvent) => {
    e.preventDefault();
    if (!newKeyword.trim()) return;
    onAddRule({ keyword: newKeyword.trim(), action: newAction });
    setNewKeyword("");
  };

  return (
    <div className="field-group">
      <form className="settings-form" onSubmit={submitKeywords}>
        <label>
          كلمات تفعّل التحويل الفوري لموظف (افصل بينها بفاصلة)
          <input value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="مثلاً: شكوى, موظف, إلحاح" />
        </label>
        <button type="submit">حفظ الكلمات</button>
        {saved && <span className="settings-saved">تم الحفظ</span>}
      </form>

      <form className="data-form" onSubmit={addRule}>
        <input placeholder="كلمة مفتاحية" value={newKeyword} onChange={(e) => setNewKeyword(e.target.value)} required />
        <select value={newAction} onChange={(e) => setNewAction(e.target.value as RoutingRule["action"])}>
          <option value="escalate">تحويل لموظف</option>
          <option value="assign_branch">تحويل لفرع محدد</option>
          <option value="auto_reply">رد تلقائي</option>
        </select>
        <button type="submit">إضافة قاعدة</button>
      </form>

      {rules.length > 0 && (
        <table className="data-table">
          <thead>
            <tr>
              <th>الكلمة</th>
              <th>الإجراء</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rules.map((r) => (
              <tr key={r.id}>
                <td>{r.keyword}</td>
                <td>{r.action === "escalate" ? "تحويل لموظف" : r.action === "assign_branch" ? "تحويل لفرع" : "رد تلقائي"}</td>
                <td>
                  <button onClick={() => onDeleteRule(r.id)}>حذف</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function ConnectionTab({
  channel,
  onRotated,
  onError,
}: {
  channel: Channel;
  onRotated: (channel: Channel) => void;
  onError: (msg: string) => void;
}) {
  const fields = PROVIDER_FIELDS[channel.channel_type];
  const [rotating, setRotating] = useState(false);
  const [newCreds, setNewCreds] = useState<Record<string, string>>({});
  const [verifyResult, setVerifyResult] = useState<VerifyCredentialsResult | null>(null);
  const [verifying, setVerifying] = useState(false);

  const handleVerify = () => {
    setVerifying(true);
    verifyChannelCredentials(channel.channel_type, newCreds)
      .then(setVerifyResult)
      .catch((err) => onError(err.response?.data?.detail ?? err.message))
      .finally(() => setVerifying(false));
  };

  const handleRotate = (e: FormEvent) => {
    e.preventDefault();
    if (!verifyResult?.valid) return;
    rotateChannelCredentials(channel.id, newCreds)
      .then((updated) => {
        onRotated(updated);
        setRotating(false);
        setNewCreds({});
        setVerifyResult(null);
      })
      .catch((err) => onError(err.response?.data?.detail ?? err.message));
  };

  return (
    <div className="field-group">
      <div className="settings-form" style={{ gap: 10 }}>
        <strong>بيانات الاتصال الحالية</strong>
        {fields.length === 0 ? (
          <p className="settings-hint" style={{ margin: 0 }}>
            لا تحتاج هذه القناة بيانات اتصال خارجية.
          </p>
        ) : Object.keys(channel.masked_credentials).length === 0 ? (
          <p className="settings-hint" style={{ margin: 0, color: "var(--warning)" }}>
            لم يتم حفظ بيانات اتصال هذه القناة بعد، لذلك لا يمكن التحقق من حالتها بدقة — أضفها الآن من "تحديث بيانات الاتصال" أدناه.
          </p>
        ) : (
          Object.entries(channel.masked_credentials).map(([key, value]) => (
            <div key={key} style={{ fontSize: 14 }}>
              {fields.find((f) => f.key === key)?.label ?? key}: <code>{value}</code>
            </div>
          ))
        )}
        {channel.token_expires_at && (
          <p className="settings-hint" style={{ margin: 0 }}>
            تاريخ انتهاء التوكن: {new Date(channel.token_expires_at).toLocaleDateString("ar")}
          </p>
        )}
      </div>

      {fields.length > 0 && !rotating && (
        <button className="btn-secondary" onClick={() => setRotating(true)} style={{ alignSelf: "flex-start" }}>
          تحديث بيانات الاتصال
        </button>
      )}

      {rotating && (
        <form className="settings-form" onSubmit={handleRotate}>
          <p className="settings-hint" style={{ margin: 0 }}>
            الصق بيانات الاتصال الجديدة — سيتم التحقق منها قبل الاستبدال. المحادثات السابقة على هذه القناة تبقى محفوظة.
          </p>
          {fields.map((f) => (
            <label key={f.key}>
              {f.label}
              <input
                type={f.secret ? "password" : "text"}
                value={newCreds[f.key] ?? ""}
                onChange={(e) => {
                  setNewCreds((prev) => ({ ...prev, [f.key]: e.target.value }));
                  setVerifyResult(null);
                }}
              />
            </label>
          ))}
          <div className="verify-row">
            <button type="button" className="btn-secondary" onClick={handleVerify} disabled={verifying}>
              {verifying ? "جاري التحقق..." : "تحقق"}
            </button>
            {verifyResult && (
              <span className={`verify-result ${verifyResult.valid ? "ok" : "fail"}`}>
                {verifyResult.valid ? "✓ تم التحقق بنجاح" : `✗ ${verifyResult.error}`}
              </span>
            )}
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button type="submit" disabled={!verifyResult?.valid}>
              استبدال
            </button>
            <button type="button" onClick={() => setRotating(false)}>
              إلغاء
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function HealthTab({ health, messages }: { health: ChannelHealthCheck | null; messages: Message[] }) {
  return (
    <div>
      {health?.error_message && <p className="health-error">{health.error_message}</p>}
      <div className="health-summary">
        <div className="health-stat">
          <div className="health-stat-label">الحالة</div>
          <div className="health-stat-value">{healthLabel[health?.status ?? "not_connected"]}</div>
        </div>
        <div className="health-stat">
          <div className="health-stat-label">صلاحية التوكن</div>
          <div className="health-stat-value">{health?.token_valid === null || health?.token_valid === undefined ? "—" : health.token_valid ? "صالح" : "غير صالح"}</div>
        </div>
        <div className="health-stat">
          <div className="health-stat-label">آخر رسالة واردة</div>
          <div className="health-stat-value">{relativeTime(health?.last_inbound_at ?? null)}</div>
        </div>
        <div className="health-stat">
          <div className="health-stat-label">آخر رسالة صادرة</div>
          <div className="health-stat-value">{relativeTime(health?.last_outbound_at ?? null)}</div>
        </div>
      </div>

      <h3 style={{ marginBottom: 10 }}>آخر 20 رسالة</h3>
      {messages.length === 0 ? (
        <p className="settings-hint">لا توجد رسائل بعد.</p>
      ) : (
        <div className="message-log">
          {messages.map((m) => (
            <div key={m.id} className="message-log-row">
              <span className="message-log-dir">{m.direction === "inbound" ? "وارد" : "صادر"}</span>
              <span className="message-log-content">{m.content}</span>
              <span className="message-log-time">{new Date(m.created_at).toLocaleString("ar")}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
