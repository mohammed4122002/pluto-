import { api } from "./client";

export type ImportDataType = "patients" | "services" | "staff" | "appointments";
export type ImportSourceType = "file" | "google_sheets" | "postgres";

export type ImportFieldInfo = { name: string; label: string; required: boolean; kind: string };

export type SourcePreviewResult = {
  columns: string[];
  sample_rows: Record<string, unknown>[];
  rows: Record<string, unknown>[];
  suggested_mapping: Record<string, string | null>;
  available_tabs: string[];
  available_tables: string[];
};

export type DatePrompt = { type: "ambiguous_date" | "possible_hijri"; field: string; sample: string };

export type ImportJob = {
  id: string;
  profile_id: string | null;
  data_type: string;
  source_type: string;
  source_label: string | null;
  branch_id: string | null;
  status: "dry_run" | "running" | "completed" | "failed";
  will_create: number;
  will_update: number;
  will_skip: number;
  will_error: number;
  created_count: number;
  updated_count: number;
  skipped_count: number;
  error_count: number;
  total_rows: number;
  processed_count: number;
  undo_status: "not_applicable" | "available" | "undone" | "refused" | "expired";
  undo_deadline: string | null;
  error_message: string | null;
  created_at: string;
  completed_at: string | null;
};

export type ImportJobRow = { row_number: number; action: string; reason: string | null; entity_id: string | null; raw_data: Record<string, unknown> };

export type DryRunResult = { job: ImportJob; rows: ImportJobRow[] };

export type UndoResult = { undone: boolean; reason: string | null; blocking: { entity_id: string; used_in: string; detail: string }[] };

export type ImportProfile = {
  id: string;
  name: string;
  data_type: string;
  source_type: string;
  branch_id: string | null;
  column_mapping: Record<string, string | null>;
  options: Record<string, unknown>;
  source_config: Record<string, unknown>;
  sync_interval_hours: number | null;
  next_sync_at: string | null;
  last_synced_at: string | null;
  last_sync_status: string | null;
  last_sync_error: string | null;
  created_at: string;
};

export const listDataTypes = () => api.get<{ value: string; label: string }[]>("/imports/data-types").then((r) => r.data);
export const getFields = (dataType: string) => api.get<ImportFieldInfo[]>("/imports/fields", { params: { data_type: dataType } }).then((r) => r.data);
export const getMatchKeyOptions = (dataType: string) => api.get<string[]>("/imports/match-key-options", { params: { data_type: dataType } }).then((r) => r.data);

export const previewFile = (dataType: string, file: File, sheetTab?: string) => {
  const form = new FormData();
  form.append("data_type", dataType);
  form.append("file", file);
  if (sheetTab) form.append("sheet_tab", sheetTab);
  return api.post<SourcePreviewResult>("/imports/preview-source/file", form).then((r) => r.data);
};

export const testGoogleSheets = (serviceAccountJson: string, spreadsheetId: string) =>
  api.post<{ title: string; tabs: string[] }>("/imports/test-google-sheets", { source_type: "google_sheets", data_type: "patients", service_account_json: serviceAccountJson, spreadsheet_id: spreadsheetId }).then((r) => r.data);

export const previewGoogleSheets = (dataType: string, serviceAccountJson: string, spreadsheetId: string, sheetTab: string) =>
  api.post<SourcePreviewResult>("/imports/preview-source/google-sheets", { data_type: dataType, source_type: "google_sheets", service_account_json: serviceAccountJson, spreadsheet_id: spreadsheetId, sheet_tab: sheetTab }).then((r) => r.data);

export const testPostgres = (connectionString: string) =>
  api.post<{ tables: string[] }>("/imports/test-postgres", { source_type: "postgres", data_type: "patients", connection_string: connectionString }).then((r) => r.data);

export const previewPostgres = (dataType: string, connectionString: string, tableName: string) =>
  api.post<SourcePreviewResult>("/imports/preview-source/postgres", { data_type: dataType, source_type: "postgres", connection_string: connectionString, table_name: tableName }).then((r) => r.data);

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export const downloadSqlServerExportScript = (dataType: string) =>
  api.get(`/imports/sqlserver-export-script`, { params: { data_type: dataType }, responseType: "blob" }).then((r) => triggerDownload(r.data, `export_${dataType}.py`));

export const scanPrompts = (dataType: string, rows: Record<string, unknown>[], columnMapping: Record<string, string | null>, options: Record<string, unknown>) =>
  api.post<{ prompt: DatePrompt | null }>("/imports/scan-prompts", { data_type: dataType, rows, column_mapping: columnMapping, options }).then((r) => r.data);

export const dryRun = (payload: {
  data_type: string;
  source_type: string;
  source_label?: string;
  branch_id?: string;
  rows: Record<string, unknown>[];
  column_mapping: Record<string, string | null>;
  options: Record<string, unknown>;
  profile_id?: string;
}) => api.post<DryRunResult>("/imports/dry-run", payload).then((r) => r.data);

export const executeJob = (jobId: string) => api.post<ImportJob>(`/imports/jobs/${jobId}/execute`).then((r) => r.data);
export const listJobs = (dataType?: string) => api.get<ImportJob[]>("/imports/jobs", { params: dataType ? { data_type: dataType } : {} }).then((r) => r.data);
export const getJob = (jobId: string) => api.get<ImportJob>(`/imports/jobs/${jobId}`).then((r) => r.data);
export const getJobRows = (jobId: string, action?: string) => api.get<ImportJobRow[]>(`/imports/jobs/${jobId}/rows`, { params: action ? { action } : {} }).then((r) => r.data);
export const undoJob = (jobId: string) => api.post<UndoResult>(`/imports/jobs/${jobId}/undo`).then((r) => r.data);

export const downloadReport = (jobId: string) =>
  api.get(`/imports/jobs/${jobId}/report`, { responseType: "blob" }).then((r) => triggerDownload(r.data, `import_report_${jobId}.xlsx`));

export const downloadErrorReport = (jobId: string) =>
  api.get(`/imports/jobs/${jobId}/error-report`, { responseType: "blob" }).then((r) => triggerDownload(r.data, `import_errors_${jobId}.xlsx`));

export const createProfile = (payload: {
  name: string;
  data_type: string;
  source_type: string;
  branch_id?: string;
  column_mapping: Record<string, string | null>;
  options: Record<string, unknown>;
  source_config?: Record<string, unknown>;
  credentials?: Record<string, unknown>;
  sync_interval_hours?: number;
}) => api.post<ImportProfile>("/imports/profiles", payload).then((r) => r.data);

export const listProfiles = (dataType?: string) => api.get<ImportProfile[]>("/imports/profiles", { params: dataType ? { data_type: dataType } : {} }).then((r) => r.data);
export const syncProfileNow = (profileId: string) => api.post<ImportJob>(`/imports/profiles/${profileId}/sync-now`).then((r) => r.data);
