import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { createBranch, listBranches, updateBranch } from "../api/branches";
import type { Branch, BranchCreate } from "../api/branches";
import { BranchHolidaysPanel } from "../components/BranchHolidaysPanel";
import { BranchIcon, CheckCircleIcon, DotsIcon, EditIcon, PlusIcon, XCircleIcon } from "../icons";
import {
  Badge,
  Button,
  Card,
  DataTable,
  Drawer,
  EmptyState,
  FormGrid,
  FormRow,
  IconButton,
  Input,
  Menu,
  PageBody,
  PageHeader,
  StatCard,
  StatGrid,
  useToast,
} from "../ui";
import type { Column } from "../ui";

const emptyForm: BranchCreate = {
  name: "",
  address: "",
  phone: "",
  timezone: "Asia/Amman",
  working_hours_note: "",
};

export function BranchesPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<BranchCreate>(emptyForm);
  const [saving, setSaving] = useState(false);
  /** null = closed, "" = creating, an id = editing that branch. */
  const [editing, setEditing] = useState<string | null>(null);
  const [holidaysForId, setHolidaysForId] = useState<string | null>(null);
  const toast = useToast();

  const fail = (err: { response?: { data?: { detail?: string } }; message: string }) =>
    toast.error(err.response?.data?.detail ?? err.message);

  const load = () => {
    setLoading(true);
    listBranches()
      .then(setBranches)
      .catch(fail)
      .finally(() => setLoading(false));
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, []);

  const openCreate = () => {
    setForm(emptyForm);
    setEditing("");
  };

  const openEdit = (branch: Branch) => {
    setForm({
      name: branch.name,
      address: branch.address ?? "",
      phone: branch.phone ?? "",
      timezone: branch.timezone,
      working_hours_note: branch.working_hours_note ?? "",
    });
    setEditing(branch.id);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    const request = editing ? updateBranch(editing, form) : createBranch(form);
    request
      .then((branch) => {
        setBranches((prev) =>
          editing
            ? prev.map((b) => (b.id === editing ? branch : b))
            : [...prev, branch].sort((a, b) => a.name.localeCompare(b.name)),
        );
        setEditing(null);
        toast.success(editing ? "تم حفظ الفرع." : "تمت إضافة الفرع.");
      })
      .catch(fail)
      .finally(() => setSaving(false));
  };

  const toggleActive = (branch: Branch) =>
    updateBranch(branch.id, { is_active: !branch.is_active })
      .then((updated) => {
        setBranches((prev) => prev.map((b) => (b.id === branch.id ? updated : b)));
        toast.success(updated.is_active ? "تم تفعيل الفرع." : "تم إيقاف الفرع.");
      })
      .catch(fail);

  const activeCount = branches.filter((b) => b.is_active).length;

  const columns: Column<Branch>[] = [
    {
      key: "name",
      header: "الفرع",
      primary: true,
      sortValue: (b) => b.name,
      cell: (b) => (
        <div className="min-w-0">
          <div className="truncate font-semibold text-heading">{b.name}</div>
          {b.address && <div className="truncate text-xs text-muted">{b.address}</div>}
        </div>
      ),
    },
    {
      key: "phone",
      header: "الهاتف",
      sortValue: (b) => b.phone,
      cell: (b) => (
        <span className="tabular-nums" dir="ltr">
          {b.phone || "—"}
        </span>
      ),
    },
    {
      key: "hours",
      header: "مواعيد الدوام",
      secondary: true,
      cell: (b) => <span className="text-[13px]">{b.working_hours_note || "—"}</span>,
    },
    {
      key: "timezone",
      header: "المنطقة الزمنية",
      secondary: true,
      sortValue: (b) => b.timezone,
      cell: (b) => (
        <span className="text-[13px] text-muted" dir="ltr">
          {b.timezone}
        </span>
      ),
    },
    {
      key: "status",
      header: "الحالة",
      sortValue: (b) => (b.is_active ? 1 : 0),
      cell: (b) => (
        <Badge tone={b.is_active ? "success" : "neutral"} dot>
          {b.is_active ? "فعّال" : "متوقف"}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "end",
      width: "120px",
      cell: (b) => (
        <div className="flex items-center justify-end gap-1.5">
          <Button size="sm" icon={<EditIcon className="size-4" />} onClick={() => openEdit(b)}>
            تعديل
          </Button>
          <Menu
            label="إجراءات الفرع"
            items={[
              {
                key: "holidays",
                label: holidaysForId === b.id ? "إخفاء العطل الرسمية" : "العطل الرسمية",
                icon: <BranchIcon />,
                onSelect: () => setHolidaysForId(holidaysForId === b.id ? null : b.id),
              },
              {
                key: "toggle",
                label: b.is_active ? "إيقاف الفرع" : "تفعيل الفرع",
                icon: b.is_active ? <XCircleIcon /> : <CheckCircleIcon />,
                danger: b.is_active,
                onSelect: () => toggleActive(b),
              },
            ]}
            trigger={(props) => (
              <IconButton {...props} title="إجراءات أخرى" size="sm" variant="secondary">
                <DotsIcon className="size-4" />
              </IconButton>
            )}
          />
        </div>
      ),
    },
  ];

  return (
    <PageBody>
      <PageHeader
        eyebrow="إعداد العيادة"
        title="الفروع"
        description="فروع العيادة، عناوينها، ومواعيد دوامها — والعطل الرسمية لكل فرع."
        actions={
          <Button variant="inverse" icon={<PlusIcon className="size-4" />} onClick={openCreate}>
            فرع جديد
          </Button>
        }
      />

      <StatGrid className="xl:grid-cols-2">
        <StatCard index={0} label="عدد الفروع" value={branches.length} icon={<BranchIcon />} tone="brand" loading={loading} />
        <StatCard
          index={1}
          label="الفروع الفعّالة"
          value={activeCount}
          icon={<CheckCircleIcon />}
          tone="teal"
          loading={loading}
          hint={branches.length - activeCount > 0 ? `${branches.length - activeCount} متوقف` : undefined}
        />
      </StatGrid>

      <DataTable
        rows={branches}
        columns={columns}
        getRowKey={(b) => b.id}
        loading={loading}
        empty={
          <EmptyState
            icon={<BranchIcon />}
            title="ما في فروع بعد"
            description="الفرع هو أساس كل شي: المواعيد، الطابور والدفعات كلها مربوطة فيه."
            action={
              <Button variant="primary" icon={<PlusIcon className="size-4" />} onClick={openCreate}>
                أضف أول فرع
              </Button>
            }
          />
        }
      />

      {holidaysForId && (
        <Card>
          <BranchHolidaysPanel
            branchId={holidaysForId}
            branchName={branches.find((b) => b.id === holidaysForId)?.name ?? ""}
          />
        </Card>
      )}

      {editing !== null && (
        <Drawer
          title={editing ? "تعديل الفرع" : "فرع جديد"}
          description="الاسم إلزامي — الباقي بيظهر للمريض في رسائل التأكيد والتذكير."
          onClose={() => setEditing(null)}
          footer={
            <>
              <Button onClick={() => setEditing(null)} disabled={saving}>
                إلغاء
              </Button>
              <Button variant="primary" type="submit" form="branch-form" loading={saving} disabled={!form.name.trim()}>
                {editing ? "حفظ التعديلات" : "إضافة الفرع"}
              </Button>
            </>
          }
        >
          <form id="branch-form" onSubmit={submit}>
            <FormGrid>
              <Input
                label="اسم الفرع"
                required
                autoFocus
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
              <Input
                label="الهاتف"
                dir="ltr"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
              <FormRow>
                <Input
                  label="العنوان"
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                />
              </FormRow>
              <FormRow>
                <Input
                  label="مواعيد الدوام"
                  hint="نص حر يظهر للمريض — مثال: الأحد-الخميس ٩ص-٥م."
                  value={form.working_hours_note}
                  onChange={(e) => setForm({ ...form, working_hours_note: e.target.value })}
                />
              </FormRow>
              <FormRow>
                <Input
                  label="المنطقة الزمنية"
                  dir="ltr"
                  hint="اسم IANA — بتحدد وقت كل موعد في هذا الفرع فعلياً."
                  value={form.timezone}
                  onChange={(e) => setForm({ ...form, timezone: e.target.value })}
                />
              </FormRow>
            </FormGrid>
          </form>
        </Drawer>
      )}
    </PageBody>
  );
}
