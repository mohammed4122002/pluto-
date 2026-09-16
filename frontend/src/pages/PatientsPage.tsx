import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  addPatientTag,
  createPatient,
  deletePatient,
  listPatientPage,
  removePatientTag,
} from "../api/patients";
import type { Patient, PatientCreate, PatientDuplicate, PatientTagValue } from "../api/patients";
import { errorMessage } from "../api/errors";
import { AlertIcon, DuplicatesIcon, PatientIcon, PlusIcon, SearchIcon } from "../icons";
import {
  Badge,
  Button,
  Card,
  DataTable,
  Dialog,
  Drawer,
  EmptyState,
  FormGrid,
  FormRow,
  IconButton,
  Input,
  PageBody,
  PageHeader,
  Select,
  StatCard,
  StatGrid,
  TableToolbar,
  Textarea,
  useToast,
} from "../ui";
import type { Column } from "../ui";

const emptyForm: PatientCreate = { full_name: "", phone: "", email: "", notes: "", date_of_birth: "" };

const tagLabels: Record<PatientTagValue, string> = {
  new: "مريض جديد",
  existing: "مريض حالي",
  vip: "VIP",
  corporate: "شركات",
  self_pay: "دفع ذاتي",
  chronic: "مرض مزمن",
  high_risk: "خطورة عالية",
  frequent_no_show: "متكرر عدم الحضور",
  blacklisted: "قائمة سوداء",
};
const allTags = Object.keys(tagLabels) as PatientTagValue[];

/** A tag is a flag, and the flags don't all mean the same thing: VIP is not a
 * warning and "قائمة سوداء" is not a compliment. The old table rendered all
 * nine in the same green pill. */
const tagTone: Record<PatientTagValue, "brand" | "neutral" | "warning" | "danger" | "teal"> = {
  new: "teal",
  existing: "neutral",
  vip: "brand",
  corporate: "brand",
  self_pay: "neutral",
  chronic: "warning",
  high_risk: "danger",
  frequent_no_show: "warning",
  blacklisted: "danger",
};

const avatarColors = ["#7c5cff", "#ff8a3d", "#22b07d", "#e5484d", "#0ea5b0", "#c026d3", "#f59e0b"];
function avatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return avatarColors[Math.abs(hash) % avatarColors.length];
}
function initial(name: string) {
  return name.trim()[0] ?? "";
}

function isMinor(dob: string | undefined): boolean {
  if (!dob) return false;
  const birth = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age--;
  return age < 18;
}

const PAGE_SIZE = 50;

export function PatientsPage() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [duplicates, setDuplicates] = useState<PatientDuplicate[] | null>(null);
  const [form, setForm] = useState<PatientCreate>(emptyForm);
  const [guardianName, setGuardianName] = useState("");
  const [guardianPhone, setGuardianPhone] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [phoneSearch, setPhoneSearch] = useState("");
  const [tagsByPatient, setTagsByPatient] = useState<Record<string, PatientTagValue[]>>({});
  const [addingTagFor, setAddingTagFor] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Patient | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const toast = useToast();

  // One page, tags included. This used to fetch every patient the caller could
  // see and then issue a separate request per row for that row's tags -- 74
  // requests today, one per patient at any size.
  const load = (phone?: string) => {
    setLoading(true);
    const request = phone
      ? listPatientPage({ search: undefined, limit: PAGE_SIZE, offset: 0 }).then((result) => ({
          ...result,
          items: result.items.filter((p) => p.phone === phone),
        }))
      : listPatientPage({ search: search.trim() || undefined, limit: PAGE_SIZE, offset: page * PAGE_SIZE });
    request
      .then((result) => {
        setPatients(result.items);
        setTotal(result.total);
        setTagsByPatient(Object.fromEntries(result.items.map((p) => [p.id, p.tags])));
      })
      .catch((err) => toast.error(errorMessage(err)))
      .finally(() => setLoading(false));
  };

  // Searching resets to the first page; paging keeps the term. Debounced so a
  // name typed letter by letter is one query, not eight.
  useEffect(() => {
    const timer = setTimeout(() => load(), search ? 300 : 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, page]);

  const fail = (err: { response?: { data?: { detail?: string } }; message: string }) =>
    toast.error(err.response?.data?.detail ?? err.message);

  const handleSearchByPhone = (e: FormEvent) => {
    e.preventDefault();
    load(phoneSearch.trim() || undefined);
  };

  const handleCreate = (e: FormEvent) => {
    e.preventDefault();
    if (!form.full_name.trim() || !form.phone.trim()) return;
    if (isMinor(form.date_of_birth) && !guardianName.trim()) {
      setFormError("المريض قاصر — يجب إدخال اسم ولي الأمر");
      return;
    }
    setSaving(true);
    setFormError(null);
    const payload: PatientCreate = { ...form, date_of_birth: form.date_of_birth || undefined };
    if (isMinor(form.date_of_birth)) {
      payload.guardian = { full_name: guardianName, phone: guardianPhone || undefined };
    }
    createPatient(payload)
      .then((result) => {
        setPatients((prev) => [...prev, result.patient]);
        setForm(emptyForm);
        setGuardianName("");
        setGuardianPhone("");
        setFormOpen(false);
        setDuplicates(result.potential_duplicates.length > 0 ? result.potential_duplicates : null);
        toast.success("تمت إضافة المريض.");
      })
      .catch((err) => {
        setFormError(err.response?.data?.detail ?? err.message);
      })
      .finally(() => setSaving(false));
  };

  const handleAddTag = (patientId: string, tag: PatientTagValue) => {
    addPatientTag(patientId, tag)
      .then(() => {
        setTagsByPatient((prev) => ({ ...prev, [patientId]: [...(prev[patientId] ?? []), tag] }));
        setAddingTagFor(null);
      })
      .catch(fail);
  };

  const handleRemoveTag = (patientId: string, tag: PatientTagValue) => {
    removePatientTag(patientId, tag)
      .then(() => setTagsByPatient((prev) => ({ ...prev, [patientId]: (prev[patientId] ?? []).filter((t) => t !== tag) })))
      .catch(fail);
  };

  // Permanent, not the tag/duplicate-merge kind of edit above — erases the
  // patient's conversations and channel identity too (server-side, see
  // delete_patient_permanently). The typed-name confirmation is on purpose:
  // this is the one action on this page real patient/financial history can't
  // survive a misclick on. Requires patient.delete server-side
  // (clinic_manager/system_administrator by default) — anyone else gets a
  // rejected request with the same error toast as any other permission failure.
  const handleDelete = (patient: Patient) =>
    deletePatient(patient.id)
      .then(() => {
        setPatients((prev) => prev.filter((p) => p.id !== patient.id));
        setTotal((prev) => prev - 1);
        setDeleting(null);
        toast.success(`تم حذف "${patient.full_name}" نهائياً.`);
      })
      .catch(fail);

  const taggedCount = patients.filter((p) => (tagsByPatient[p.id] ?? []).length > 0).length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const minorForm = isMinor(form.date_of_birth);

  const columns: Column<Patient>[] = [
    {
      key: "name",
      header: "الاسم",
      primary: true,
      sortValue: (p) => p.full_name,
      cell: (p) => (
        <div className="flex items-center gap-2.5">
          <span
            className="grid size-8 shrink-0 place-items-center rounded-full text-[13px] font-bold text-white"
            style={{ background: avatarColor(p.full_name) }}
            aria-hidden="true"
          >
            {initial(p.full_name)}
          </span>
          <span className="min-w-0 truncate font-semibold text-heading">{p.full_name}</span>
        </div>
      ),
    },
    {
      key: "phone",
      header: "الهاتف",
      sortValue: (p) => p.phone,
      cell: (p) => (
        <span className="text-[13px] tabular-nums" dir="ltr">
          {p.phone}
        </span>
      ),
    },
    {
      key: "email",
      header: "الإيميل",
      secondary: true,
      sortValue: (p) => p.email,
      cell: (p) => (
        <span className="text-[13px] text-muted" dir="ltr">
          {p.email || "—"}
        </span>
      ),
    },
    {
      key: "notes",
      header: "ملاحظات",
      secondary: true,
      cell: (p) => (
        <span className="line-clamp-2 max-w-[22ch] text-[13px] text-muted">{p.notes || "—"}</span>
      ),
    },
    {
      key: "tags",
      header: "التصنيفات",
      cell: (p) => {
        const tags = tagsByPatient[p.id] ?? [];
        const available = allTags.filter((t) => !tags.includes(t));
        return (
          <div className="flex flex-wrap items-center gap-1.5">
            {tags.map((tag) => (
              <Badge key={tag} tone={tagTone[tag]}>
                {tagLabels[tag]}
                <button
                  type="button"
                  onClick={() => handleRemoveTag(p.id, tag)}
                  aria-label={`إزالة تصنيف ${tagLabels[tag]}`}
                  className="-me-1 grid size-4 cursor-pointer place-items-center rounded-full opacity-60 transition hover:bg-current/15 hover:opacity-100"
                >
                  <svg viewBox="0 0 24 24" className="size-3" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round">
                    <path d="m6 6 12 12M18 6 6 18" />
                  </svg>
                </button>
              </Badge>
            ))}
            {/* patient.tag isn't in the doctor role's grant -- read-only for them. */}
            {addingTagFor === p.id ? (
              <Select
                autoFocus
                className="h-7 w-36 text-[12.5px]"
                onBlur={() => setAddingTagFor(null)}
                onChange={(e) => e.target.value && handleAddTag(p.id, e.target.value as PatientTagValue)}
              >
                <option value="">اختر تصنيفاً</option>
                {available.map((t) => (
                  <option key={t} value={t}>
                    {tagLabels[t]}
                  </option>
                ))}
              </Select>
            ) : (
              available.length > 0 && (
                <button
                  type="button"
                  onClick={() => setAddingTagFor(p.id)}
                  className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-dashed border-line-strong px-2.5 py-1 text-[12.5px] font-semibold text-muted transition hover:border-brand-border hover:text-brand"
                >
                  <PlusIcon className="size-3" />
                  تصنيف
                </button>
              )
            )}
          </div>
        );
      },
    },
    {
      key: "actions",
      header: "",
      align: "end",
      width: "60px",
      cell: (p) => (
        <IconButton
          title="حذف نهائي مع كل المحادثات"
          size="sm"
          variant="danger-soft"
          onClick={() => setDeleting(p)}
        >
          <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" />
          </svg>
        </IconButton>
      ),
    },
  ];

  return (
    <PageBody>
      <PageHeader
        title="سجلات المرضى"
        description="كل مرضى العيادة، تصنيفاتهم، وسجل بياناتهم الأساسي."
        actions={
          <Button variant="inverse" icon={<PlusIcon className="size-4" />} onClick={() => setFormOpen(true)}>
            مريض جديد
          </Button>
        }
      />

      <StatGrid>
        <StatCard label="إجمالي المرضى" value={total} icon={<PatientIcon />} tone="brand" loading={loading} />
        <StatCard
          label="معروض بهذه الصفحة"
          value={patients.length}
          icon={<PatientIcon />}
          tone="teal"
          loading={loading}
          hint={`صفحة ${page + 1} من ${pageCount}`}
        />
        <StatCard
          label="لديهم تصنيف"
          value={taggedCount}
          icon={<AlertIcon />}
          tone="amber"
          loading={loading}
          hint="ضمن الصفحة الحالية"
        />
        <StatCard
          label="سجلات محتملة التكرار"
          value={duplicates?.length ?? 0}
          icon={<DuplicatesIcon />}
          tone="rose"
          loading={loading}
          hint="من آخر إضافة"
        />
      </StatGrid>

      {duplicates && (
        <Card className="border-warning-border bg-warning-bg">
          <div className="flex items-start gap-3">
            <AlertIcon className="mt-0.5 size-5 shrink-0 text-warning" />
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-bold text-heading">تنبيه: احتمال وجود سجلات مكررة</h2>
              <ul className="mt-2 flex flex-col gap-1 text-[13px] text-fg">
                {duplicates.map((d) => (
                  <li key={d.id}>
                    يشبه «{d.patient_b_name}» ({d.patient_b_phone}) بنسبة {d.match_score}% — راجع صفحة «السجلات المكررة».
                  </li>
                ))}
              </ul>
            </div>
            <Button size="sm" onClick={() => setDuplicates(null)}>
              إخفاء
            </Button>
          </div>
        </Card>
      )}

      <TableToolbar>
        <Input
          className="w-full sm:w-96"
          label="بحث في كل السجلات"
          placeholder="ابحث بالاسم أو الهاتف — بكل السجلات، مش بالصفحة الحالية..."
          icon={<SearchIcon />}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(0);
          }}
        />
        <form onSubmit={handleSearchByPhone} className="flex w-full items-end gap-2 sm:w-auto">
          <Input
            className="w-full sm:w-64"
            label="بحث بالهاتف عبر كل الفروع"
            title="يشمل مرضى الفروع الأخرى — لزيارة أول مرة مثلاً."
            placeholder="+9627..."
            dir="ltr"
            value={phoneSearch}
            onChange={(e) => setPhoneSearch(e.target.value)}
          />
          <Button type="submit">بحث</Button>
          {phoneSearch && (
            <Button
              type="button"
              onClick={() => {
                setPhoneSearch("");
                load();
              }}
            >
              مسح
            </Button>
          )}
        </form>
      </TableToolbar>

      <DataTable
        rows={patients}
        columns={columns}
        getRowKey={(p) => p.id}
        loading={loading}
        empty={
          <EmptyState
            icon={<PatientIcon />}
            title={search ? "ما في مرضى مطابقين للبحث" : "ما في مرضى بعد"}
            description={
              search
                ? "جرّب اسماً أو رقماً مختلفاً، أو امسح البحث."
                : "أضف أول مريض وابدأ بحجز مواعيده مباشرة."
            }
            action={
              search ? (
                <Button onClick={() => setSearch("")}>مسح البحث</Button>
              ) : (
                <Button variant="primary" icon={<PlusIcon className="size-4" />} onClick={() => setFormOpen(true)}>
                  مريض جديد
                </Button>
              )
            }
          />
        }
        footer={
          total > PAGE_SIZE ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-[13px] text-muted">
                صفحة {page + 1} من {pageCount} · {total} مريض
              </span>
              <div className="flex items-center gap-2">
                <Button size="sm" disabled={page === 0} onClick={() => setPage((n) => n - 1)}>
                  السابق
                </Button>
                <Button size="sm" disabled={page + 1 >= pageCount} onClick={() => setPage((n) => n + 1)}>
                  التالي
                </Button>
              </div>
            </div>
          ) : undefined
        }
      />

      {formOpen && (
        <Drawer
          title="مريض جديد"
          description="الاسم والهاتف إلزاميان — الباقي بيساعد على التواصل والتذكير."
          onClose={() => setFormOpen(false)}
          footer={
            <>
              <Button onClick={() => setFormOpen(false)} disabled={saving}>
                إلغاء
              </Button>
              <Button
                variant="primary"
                type="submit"
                form="patient-form"
                loading={saving}
                disabled={!form.full_name.trim() || !form.phone.trim()}
              >
                إضافة المريض
              </Button>
            </>
          }
        >
          <form id="patient-form" onSubmit={handleCreate}>
            <FormGrid>
              <Input
                label="الاسم الكامل"
                required
                autoFocus
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              />
              <Input
                label="رقم الهاتف"
                required
                dir="ltr"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
              <Input
                label="تاريخ الميلاد"
                type="date"
                value={form.date_of_birth}
                onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })}
              />
              <Input
                label="الإيميل"
                type="email"
                dir="ltr"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
              <FormRow>
                <Textarea
                  label="ملاحظات"
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </FormRow>
              {minorForm && (
                <FormRow>
                  <div className="rounded-xl border border-warning-border bg-warning-bg p-4">
                    <p className="mb-3 text-[13px] font-bold text-heading">
                      المريض قاصر — بيانات ولي الأمر إلزامية (BR-011)
                    </p>
                    <FormGrid>
                      <Input
                        label="اسم ولي الأمر"
                        required
                        value={guardianName}
                        onChange={(e) => setGuardianName(e.target.value)}
                      />
                      <Input
                        label="رقم هاتف ولي الأمر"
                        dir="ltr"
                        value={guardianPhone}
                        onChange={(e) => setGuardianPhone(e.target.value)}
                      />
                    </FormGrid>
                  </div>
                </FormRow>
              )}
              {formError && (
                <FormRow>
                  <p className="rounded-lg border border-danger-border bg-danger-bg px-3 py-2 text-[13px] font-semibold text-danger">
                    {formError}
                  </p>
                </FormRow>
              )}
            </FormGrid>
          </form>
        </Drawer>
      )}

      {deleting && (
        <DeletePatientDialog patient={deleting} onClose={() => setDeleting(null)} onConfirm={handleDelete} />
      )}
    </PageBody>
  );
}

/** The typed-name gate for a permanent delete. Replaces a `confirm()` followed
 * by a `prompt()` -- two native popups that look like a browser malfunction
 * and can't show what is actually about to be erased. */
function DeletePatientDialog({
  patient,
  onClose,
  onConfirm,
}: {
  patient: Patient;
  onClose: () => void;
  onConfirm: (patient: Patient) => Promise<unknown>;
}) {
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const matches = typed.trim() === patient.full_name;

  return (
    <Dialog
      title="حذف المريض نهائياً"
      size="sm"
      onClose={busy ? () => undefined : onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            تراجع
          </Button>
          <Button
            variant="danger"
            loading={busy}
            disabled={!matches}
            onClick={() => {
              setBusy(true);
              onConfirm(patient).finally(() => setBusy(false));
            }}
          >
            حذف نهائي
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="rounded-xl border border-danger-border bg-danger-bg px-4 py-3 text-[13px] leading-6 text-heading">
          سيتم حذف <strong>«{patient.full_name}»</strong> نهائياً مع كل محادثاته ومواعيده ومدفوعاته — إجراء
          لا يمكن التراجع عنه إطلاقاً.
        </p>
        <Input
          label={`للتأكيد، اكتب اسم المريض بالضبط: ${patient.full_name}`}
          autoFocus
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          error={typed && !matches ? "الاسم غير مطابق." : undefined}
        />
      </div>
    </Dialog>
  );
}
