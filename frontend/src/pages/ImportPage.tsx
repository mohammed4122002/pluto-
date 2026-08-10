import { useEffect, useState } from "react";
import { listBranches } from "../api/branches";
import type { Branch } from "../api/branches";
import {
  createProfile,
  downloadErrorReport,
  downloadReport,
  downloadSqlServerExportScript,
  dryRun,
  executeJob,
  getFields,
  getJob,
  getMatchKeyOptions,
  listJobs,
  previewFile,
  previewGoogleSheets,
  previewPostgres,
  testGoogleSheets,
  testPostgres,
  undoJob,
} from "../api/imports";
import type {
  DatePrompt,
  ImportDataType,
  ImportFieldInfo,
  ImportJob,
  ImportSourceType,
  SourcePreviewResult,
} from "../api/imports";

const SOURCE_LABELS: Record<ImportSourceType | "sqlserver", string> = {
  file: "ملف (Excel / CSV)",
  google_sheets: "Google Sheets",
  postgres: "قاعدة بيانات (Postgres)",
  sqlserver: "SQL Server",
};


import { importStatusLabel as STATUS_LABELS } from "../statusLabels";
import { formatDateTimeShort } from "../format";

const UNDO_LABELS: Record<string, string> = {
  not_applicable: "—",
  available: "متاح",
  undone: "تم التراجع",
  refused: "مرفوض",
  expired: "انتهت المهلة",
};

type View = { mode: "history" } | { mode: "wizard" };

export function ImportPage() {
  const [view, setView] = useState<View>({ mode: "history" });
  return view.mode === "wizard" ? (
    <ImportWizard onDone={() => setView({ mode: "history" })} />
  ) : (
    <ImportHistory onStartNew={() => setView({ mode: "wizard" })} />
  );
}

function ImportHistory({ onStartNew }: { onStartNew: () => void }) {
  const [jobs, setJobs] = useState<ImportJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    listJobs()
      .then(setJobs)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const handleUndo = (job: ImportJob) => {
    if (!window.confirm("سيتم التراجع عن هذا الاستيراد: حذف السجلات التي أضافها واستعادة القيم السابقة للسجلات التي عدّلها. متابعة؟")) return;
    setBusyId(job.id);
    undoJob(job.id)
      .then((res) => {
        if (!res.undone) {
          const detail = res.blocking.length
            ? `\n\nسجلات مستخدمة تمنع التراجع:\n` + res.blocking.map((b) => `- ${b.used_in}: ${b.detail}`).join("\n")
            : "";
          window.alert(`${res.reason}${detail}`);
        }
        load();
      })
      .catch((err) => setError(err.response?.data?.detail ?? err.message))
      .finally(() => setBusyId(null));
  };

  return (
    <div className="page">
      {error && <p className="error">{error}</p>}
      <div className="page-header">
        <div>
          <p className="page-header-title">استيراد بيانات</p>
          <p className="page-header-subtitle">استيراد مرضى ومواعيد من ملف أو قاعدة بيانات خارجية، وسجل عمليات الاستيراد السابقة.</p>
        </div>
        <button className="btn-primary" onClick={onStartNew}>
          + استيراد جديد
        </button>
      </div>

      {loading ? (
        <p>جاري التحميل...</p>
      ) : jobs.length === 0 ? (
        <p>لا يوجد سجل استيراد بعد.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>التاريخ</th>
              <th>النوع</th>
              <th>المصدر</th>
              <th>أُضيف</th>
              <th>تحدّث</th>
              <th>تجاهل</th>
              <th>أخطاء</th>
              <th>الحالة</th>
              <th>التراجع</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => (
              <tr key={job.id}>
                <td>{formatDateTimeShort(job.created_at)}</td>
                <td>{job.data_type}</td>
                <td>{job.source_label ?? job.source_type}</td>
                <td>{job.created_count}</td>
                <td>{job.updated_count}</td>
                <td>{job.skipped_count}</td>
                <td>{job.error_count}</td>
                <td>
                  <span className={job.status === "completed" ? "badge active" : "badge inactive"}>{STATUS_LABELS[job.status]}</span>
                </td>
                <td>{UNDO_LABELS[job.undo_status]}</td>
                <td>
                  <button onClick={() => downloadReport(job.id)}>تقرير</button>
                  {job.error_count > 0 && <button onClick={() => downloadErrorReport(job.id)}>تقرير الأخطاء</button>}
                  {job.undo_status === "available" && (
                    <button onClick={() => handleUndo(job)} disabled={busyId === job.id}>
                      {busyId === job.id ? "..." : "تراجع"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

type WizardStep = 1 | 2 | 3 | 4 | 5 | 6;

function ImportWizard({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState<WizardStep>(1);
  const [dataType, setDataType] = useState<ImportDataType>("patients");
  const [sourceType, setSourceType] = useState<ImportSourceType | "sqlserver">("file");
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState("");
  const [fields, setFields] = useState<ImportFieldInfo[]>([]);
  const [matchKeyOptions, setMatchKeyOptions] = useState<string[]>([]);

  const [preview, setPreview] = useState<SourcePreviewResult | null>(null);
  const [sourceLabel, setSourceLabel] = useState("");
  const [mapping, setMapping] = useState<Record<string, string | null>>({});
  const [onExisting, setOnExisting] = useState<"update" | "skip" | "abort">("update");
  const [matchKey, setMatchKey] = useState("");
  const [datePrompt, setDatePrompt] = useState<DatePrompt | null>(null);
  const [dayFirst, setDayFirst] = useState<boolean | null>(null);
  const [assumeHijri, setAssumeHijri] = useState<boolean | null>(null);

  const [job, setJob] = useState<ImportJob | null>(null);
  const [jobRows, setJobRows] = useState<{ row_number: number; action: string; reason: string | null }[]>([]);
  const [saveProfile, setSaveProfile] = useState(false);
  const [profileName, setProfileName] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listBranches().then(setBranches).catch(() => {});
  }, []);

  useEffect(() => {
    getFields(dataType).then(setFields).catch(() => {});
    getMatchKeyOptions(dataType).then((opts) => {
      setMatchKeyOptions(opts);
      setMatchKey(opts[0] ?? "");
    }).catch(() => {});
  }, [dataType]);

  const needsBranch = dataType === "staff" || dataType === "appointments";

  // ---- step 2: source-specific state ----
  const [file, setFile] = useState<File | null>(null);
  const [sheetTab, setSheetTab] = useState("");
  const [serviceAccountJson, setServiceAccountJson] = useState("");
  const [spreadsheetId, setSpreadsheetId] = useState("");
  const [gsheetTabs, setGsheetTabs] = useState<string[]>([]);
  const [gsheetVerified, setGsheetVerified] = useState(false);
  const [connectionString, setConnectionString] = useState("");
  const [pgTables, setPgTables] = useState<string[]>([]);
  const [pgTable, setPgTable] = useState("");
  const [pgVerified, setPgVerified] = useState(false);

  const handleFileUpload = () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    previewFile(dataType, file, sheetTab || undefined)
      .then((res) => {
        setPreview(res);
        setSourceLabel(file.name);
        setMapping(res.suggested_mapping);
        setStep(3);
      })
      .catch((err) => setError(err.response?.data?.detail ?? err.message))
      .finally(() => setBusy(false));
  };

  const handleVerifyGoogleSheets = () => {
    setBusy(true);
    setError(null);
    testGoogleSheets(serviceAccountJson, spreadsheetId)
      .then((res) => {
        setGsheetTabs(res.tabs);
        setGsheetVerified(true);
      })
      .catch((err) => setError(err.response?.data?.detail ?? err.message))
      .finally(() => setBusy(false));
  };

  const handleReadGoogleSheet = () => {
    setBusy(true);
    setError(null);
    previewGoogleSheets(dataType, serviceAccountJson, spreadsheetId, sheetTab)
      .then((res) => {
        setPreview(res);
        setSourceLabel(`Google Sheets: ${sheetTab}`);
        setMapping(res.suggested_mapping);
        setStep(3);
      })
      .catch((err) => setError(err.response?.data?.detail ?? err.message))
      .finally(() => setBusy(false));
  };

  const handleVerifyPostgres = () => {
    setBusy(true);
    setError(null);
    testPostgres(connectionString)
      .then((res) => {
        setPgTables(res.tables);
        setPgVerified(true);
      })
      .catch((err) => setError(err.response?.data?.detail ?? err.message))
      .finally(() => setBusy(false));
  };

  const handleReadPostgres = () => {
    setBusy(true);
    setError(null);
    previewPostgres(dataType, connectionString, pgTable)
      .then((res) => {
        setPreview(res);
        setSourceLabel(`DB: ${pgTable}`);
        setMapping(res.suggested_mapping);
        setStep(3);
      })
      .catch((err) => setError(err.response?.data?.detail ?? err.message))
      .finally(() => setBusy(false));
  };

  // ---- step 3 -> 4 ----
  const requiredMissing = fields.filter((f) => f.required && !Object.values(mapping).includes(f.name));

  // ---- step 4 -> 5: dry run (handles the ask-before-guessing date/hijri prompt) ----
  const runDryRun = (options: Record<string, unknown>) => {
    if (!preview) return;
    setBusy(true);
    setError(null);
    dryRun({
      data_type: dataType,
      source_type: sourceType === "sqlserver" ? "file" : sourceType,
      source_label: sourceLabel,
      branch_id: needsBranch ? branchId : undefined,
      rows: preview.rows,
      column_mapping: mapping,
      options,
    })
      .then((res) => {
        setJob(res.job);
        setJobRows(res.rows);
        setStep(5);
        if (saveProfile && profileName.trim()) {
          createProfile({
            name: profileName.trim(),
            data_type: dataType,
            source_type: sourceType === "sqlserver" ? "file" : sourceType,
            branch_id: needsBranch ? branchId : undefined,
            column_mapping: mapping,
            options,
          }).catch(() => {});
        }
      })
      .catch((err) => {
        const detail = err.response?.data?.detail;
        if (detail && typeof detail === "object" && detail.needs_clarification) {
          setDatePrompt(detail as DatePrompt);
        } else {
          setError(detail ?? err.message);
        }
      })
      .finally(() => setBusy(false));
  };

  const handleStartDryRun = () => {
    const options: Record<string, unknown> = { on_existing: onExisting, match_key: matchKey };
    if (dayFirst !== null) options.day_first = dayFirst;
    if (assumeHijri !== null) options.assume_hijri = assumeHijri;
    runDryRun(options);
  };

  const handleAnswerPrompt = (answer: boolean) => {
    if (!datePrompt) return;
    if (datePrompt.type === "ambiguous_date") setDayFirst(answer);
    else setAssumeHijri(answer);
    setDatePrompt(null);
    const options: Record<string, unknown> = { on_existing: onExisting, match_key: matchKey };
    if (datePrompt.type === "ambiguous_date") options.day_first = answer;
    else options.day_first = dayFirst ?? true;
    if (datePrompt.type === "possible_hijri") options.assume_hijri = answer;
    else options.assume_hijri = assumeHijri ?? false;
    runDryRun(options);
  };

  // ---- step 5 -> 6: execute + poll ----
  const handleExecute = () => {
    if (!job) return;
    setBusy(true);
    setError(null);
    executeJob(job.id)
      .then((updated) => {
        setJob(updated);
        setStep(6);
      })
      .catch((err) => setError(err.response?.data?.detail ?? err.message))
      .finally(() => setBusy(false));
  };

  useEffect(() => {
    if (step !== 6 || !job || job.status === "completed" || job.status === "failed") return;
    const timer = setInterval(() => {
      getJob(job.id).then(setJob).catch(() => {});
    }, 1200);
    return () => clearInterval(timer);
  }, [step, job]);

  return (
    <div className="page">
      <button className="panel-back" onClick={onDone}>
        → رجوع لسجل الاستيراد
      </button>
      {error && <p className="error">{error}</p>}

      {datePrompt && (
        <div className="health-error" style={{ background: "var(--warning-bg)", color: "var(--warning)" }}>
          {datePrompt.type === "ambiguous_date" ? (
            <>
              <p>وجدنا تاريخاً غامضاً في الملف: <strong>{datePrompt.sample}</strong> — هل اليوم أولاً أم الشهر أولاً؟</p>
              <button onClick={() => handleAnswerPrompt(true)}>اليوم أولاً (DD/MM/YYYY)</button>{" "}
              <button onClick={() => handleAnswerPrompt(false)}>الشهر أولاً (MM/DD/YYYY)</button>
            </>
          ) : (
            <>
              <p>يبدو أن السنة <strong>{datePrompt.sample}</strong> بالتقويم الهجري — هل نحوّلها للميلادي (تقريبي)؟</p>
              <button onClick={() => handleAnswerPrompt(true)}>نعم، هجري</button>{" "}
              <button onClick={() => handleAnswerPrompt(false)}>لا، ميلادي كما هو</button>
            </>
          )}
        </div>
      )}

      {step === 1 && (
        <div className="field-group">
          <h2>١. نوع البيانات ومصدرها</h2>
          <div className="field-row">
            <label>نوع البيانات</label>
            <select value={dataType} onChange={(e) => setDataType(e.target.value as ImportDataType)}>
              <option value="patients">المرضى</option>
              <option value="services">الخدمات</option>
              <option value="staff">الموظفين</option>
              <option value="appointments">المواعيد</option>
            </select>
          </div>
          {needsBranch && (
            <div className="field-row">
              <label>الفرع</label>
              <select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                <option value="">اختر فرعاً</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
          )}
          <div className="field-row">
            <label>مصدر البيانات</label>
            <div className="provider-picker">
              {(Object.keys(SOURCE_LABELS) as (ImportSourceType | "sqlserver")[]).map((s) => (
                <button
                  key={s}
                  className={`provider-option ${sourceType === s ? "selected" : ""}`}
                  onClick={() => setSourceType(s)}
                  type="button"
                >
                  {SOURCE_LABELS[s]}
                </button>
              ))}
            </div>
          </div>
          <button className="btn-primary" disabled={needsBranch && !branchId} onClick={() => setStep(2)}>
            التالي
          </button>
        </div>
      )}

      {step === 2 && sourceType === "file" && (
        <div className="field-group">
          <h2>٢. رفع الملف</h2>
          <input type="file" accept=".csv,.xlsx,.xlsm" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <p className="field-hint">يدعم CSV وExcel — يكتشف النظام صف العناوين والترميز والفاصل تلقائياً.</p>
          <button className="btn-primary" disabled={!file || busy} onClick={handleFileUpload}>
            {busy ? "جاري القراءة..." : "قراءة الملف"}
          </button>
        </div>
      )}

      {step === 2 && sourceType === "google_sheets" && (
        <div className="field-group">
          <h2>٢. الاتصال بـ Google Sheets</h2>
          <div className="field-row">
            <label>مفتاح حساب الخدمة (Service Account JSON)</label>
            <textarea rows={4} value={serviceAccountJson} onChange={(e) => setServiceAccountJson(e.target.value)} placeholder='{"client_email": "...", "private_key": "..."}' />
            <p className="field-hint">
              أنشئ Service Account من Google Cloud Console، فعّل Google Sheets API، وشارك الشيت مع بريد الحساب (من الحقل client_email) كمُشاهد.{" "}
              <a href="https://console.cloud.google.com/iam-admin/serviceaccounts" target="_blank" rel="noreferrer">فتح Google Cloud Console</a>
            </p>
          </div>
          <div className="field-row">
            <label>معرّف الشيت (Spreadsheet ID)</label>
            <input value={spreadsheetId} onChange={(e) => setSpreadsheetId(e.target.value)} placeholder="من رابط الشيت بين /d/ و /edit" />
          </div>
          <div className="verify-row">
            <button className="btn-secondary" type="button" disabled={busy || !serviceAccountJson || !spreadsheetId} onClick={handleVerifyGoogleSheets}>
              {busy ? "جاري التحقق..." : "تحقق"}
            </button>
            {gsheetVerified && <span className="verify-result ok">✓ تم الاتصال — اختر التبويب أدناه</span>}
          </div>
          {gsheetVerified && (
            <div className="field-row">
              <label>التبويب (Tab)</label>
              <select value={sheetTab} onChange={(e) => setSheetTab(e.target.value)}>
                <option value="">اختر تبويباً</option>
                {gsheetTabs.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <button className="btn-primary" disabled={!sheetTab || busy} onClick={handleReadGoogleSheet} style={{ marginTop: 10 }}>
                قراءة البيانات
              </button>
            </div>
          )}
        </div>
      )}

      {step === 2 && sourceType === "postgres" && (
        <div className="field-group">
          <h2>٢. الاتصال بقاعدة البيانات</h2>
          <div className="field-row">
            <label>Connection String (للقراءة فقط)</label>
            <input value={connectionString} onChange={(e) => setConnectionString(e.target.value)} placeholder="postgresql://user:password@host:5432/dbname" />
            <p className="field-hint">يُفرض SSL تلقائياً على الاتصال. استخدم مستخدم قاعدة بيانات صلاحياته قراءة فقط إن أمكن.</p>
          </div>
          <div className="verify-row">
            <button className="btn-secondary" type="button" disabled={busy || !connectionString} onClick={handleVerifyPostgres}>
              {busy ? "جاري التحقق..." : "تحقق"}
            </button>
            {pgVerified && <span className="verify-result ok">✓ تم الاتصال — اختر الجدول أدناه</span>}
          </div>
          {pgVerified && (
            <div className="field-row">
              <label>الجدول</label>
              <select value={pgTable} onChange={(e) => setPgTable(e.target.value)}>
                <option value="">اختر جدولاً</option>
                {pgTables.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <button className="btn-primary" disabled={!pgTable || busy} onClick={handleReadPostgres} style={{ marginTop: 10 }}>
                قراءة البيانات
              </button>
            </div>
          )}
        </div>
      )}

      {step === 2 && sourceType === "sqlserver" && (
        <div className="field-group">
          <h2>٢. SQL Server</h2>
          <p className="field-hint">
            خوادم SQL Server المحلية غالباً لا يمكن الوصول إليها من الإنترنت مباشرة. حمّل سكربت تصدير جاهز، شغّله على
            جهازك ليولّد ملف Excel، ثم ارجع واختر "ملف" كمصدر وارفعه.
          </p>
          <button className="btn-secondary" onClick={() => downloadSqlServerExportScript(dataType)}>
            تنزيل سكربت التصدير
          </button>
          <button className="btn-primary" style={{ marginTop: 10 }} onClick={() => setSourceType("file")}>
            الآن اختر "ملف" لرفع نتيجة التصدير
          </button>
        </div>
      )}

      {step === 3 && preview && (
        <div className="field-group">
          <h2>٣. مطابقة الأعمدة</h2>
          {requiredMissing.length > 0 && (
            <p className="error">حقول مطلوبة غير مطابَقة: {requiredMissing.map((f) => f.label).join("، ")}</p>
          )}
          <table className="data-table">
            <thead>
              <tr>
                <th>عمود الملف</th>
                <th>يُطابق حقل</th>
                <th>مثال</th>
              </tr>
            </thead>
            <tbody>
              {preview.columns.map((col) => (
                <tr key={col}>
                  <td>{col}</td>
                  <td>
                    <select value={mapping[col] ?? ""} onChange={(e) => setMapping({ ...mapping, [col]: e.target.value || null })}>
                      <option value="">تجاهل هذا العمود</option>
                      {fields.map((f) => (
                        <option key={f.name} value={f.name}>{f.label}{f.required ? " *" : ""}</option>
                      ))}
                    </select>
                  </td>
                  <td>{String(preview.sample_rows[0]?.[col] ?? "")}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="checkbox-group">
            <label>
              <input type="checkbox" checked={saveProfile} onChange={(e) => setSaveProfile(e.target.checked)} />
              احفظ هذه المطابقة كإعداد لإعادة استخدامه لاحقاً
            </label>
            {saveProfile && <input placeholder="اسم الإعداد" value={profileName} onChange={(e) => setProfileName(e.target.value)} />}
          </div>
          <button className="btn-primary" disabled={requiredMissing.length > 0} onClick={() => setStep(4)}>
            التالي
          </button>
        </div>
      )}

      {step === 4 && (
        <div className="field-group">
          <h2>٤. خيارات الاستيراد</h2>
          <div className="field-row">
            <label>عند وجود سجل مطابق مسبقاً</label>
            <select value={onExisting} onChange={(e) => setOnExisting(e.target.value as typeof onExisting)}>
              <option value="update">تحديث السجل الموجود</option>
              <option value="skip">تجاهل الصف</option>
              <option value="abort">اعتباره خطأ (لا تكتب شيء)</option>
            </select>
          </div>
          {matchKeyOptions.length > 1 && (
            <div className="field-row">
              <label>مفتاح المطابقة (كيف نعرف أن السجل موجود مسبقاً)</label>
              <select value={matchKey} onChange={(e) => setMatchKey(e.target.value)}>
                {matchKeyOptions.map((k) => (
                  <option key={k} value={k}>{fields.find((f) => f.name === k)?.label ?? k}</option>
                ))}
              </select>
            </div>
          )}
          <button className="btn-primary" disabled={busy} onClick={handleStartDryRun}>
            {busy ? "جاري التحضير..." : "التالي: معاينة قبل الاستيراد"}
          </button>
        </div>
      )}

      {step === 5 && job && (
        <div>
          <h2>٥. معاينة (dry run) — لا كتابة فعلية بعد</h2>
          <div className="health-summary">
            <div className="health-stat"><div className="health-stat-label">سيُضاف</div><div className="health-stat-value">{job.will_create}</div></div>
            <div className="health-stat"><div className="health-stat-label">سيُحدَّث</div><div className="health-stat-value">{job.will_update}</div></div>
            <div className="health-stat"><div className="health-stat-label">سيُتجاهل</div><div className="health-stat-value">{job.will_skip}</div></div>
            <div className="health-stat"><div className="health-stat-label">أخطاء</div><div className="health-stat-value">{job.will_error}</div></div>
          </div>

          <table className="data-table">
            <thead>
              <tr><th>الصف</th><th>الإجراء</th><th>السبب</th></tr>
            </thead>
            <tbody>
              {jobRows.slice(0, 100).map((r) => (
                <tr key={r.row_number}>
                  <td>{r.row_number}</td>
                  <td>{r.action === "create" ? "سيُضاف" : r.action === "update" ? "سيُحدَّث" : r.action === "skip" ? "سيُتجاهل" : "خطأ"}</td>
                  <td>{r.reason ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {jobRows.length > 100 && <p className="settings-hint">عرض أول 100 صف من أصل {jobRows.length}.</p>}

          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            {job.will_error > 0 && <button onClick={() => downloadErrorReport(job.id)}>تنزيل تقرير الأخطاء</button>}
            <button className="btn-primary" disabled={busy} onClick={handleExecute}>
              {busy ? "..." : "تأكيد الاستيراد"}
            </button>
          </div>
        </div>
      )}

      {step === 6 && job && (
        <div>
          <h2>٦. التنفيذ</h2>
          {job.status !== "completed" && job.status !== "failed" ? (
            <div>
              <p>جاري التنفيذ... ({job.processed_count} من {job.total_rows})</p>
              <div style={{ background: "var(--bg)", borderRadius: 8, height: 10, overflow: "hidden", maxWidth: 400 }}>
                <div style={{ background: "var(--accent)", height: "100%", width: `${job.total_rows ? (job.processed_count / job.total_rows) * 100 : 0}%` }} />
              </div>
            </div>
          ) : job.status === "failed" ? (
            <p className="error">فشل التنفيذ: {job.error_message}</p>
          ) : (
            <div>
              <div className="health-summary">
                <div className="health-stat"><div className="health-stat-label">أُضيف</div><div className="health-stat-value">{job.created_count}</div></div>
                <div className="health-stat"><div className="health-stat-label">تحدّث</div><div className="health-stat-value">{job.updated_count}</div></div>
                <div className="health-stat"><div className="health-stat-label">تُجوهل</div><div className="health-stat-value">{job.skipped_count}</div></div>
                <div className="health-stat"><div className="health-stat-label">أخطاء</div><div className="health-stat-value">{job.error_count}</div></div>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={() => downloadReport(job.id)}>تنزيل التقرير الكامل</button>
                {job.error_count > 0 && <button onClick={() => downloadErrorReport(job.id)}>تنزيل تقرير الأخطاء</button>}
                <button className="btn-primary" onClick={onDone}>إنهاء</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
