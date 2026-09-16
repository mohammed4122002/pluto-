import { useEffect, useMemo, useState } from "react";
import { getMyPatients } from "../../api/me";
import type { MyPatient } from "../../api/me";
import { errorMessage } from "../../api/errors";
import { formatDateShort, formatNumber } from "../../format";
import { AppointmentIcon, PatientIcon, SearchIcon } from "../../icons";
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  Input,
  PageBody,
  PageHeader,
  StatCard,
  StatGrid,
  TableToolbar,
  useToast,
} from "../../ui";
import type { Column } from "../../ui";

const tagLabel: Record<string, string> = {
  vip: "VIP",
  chronic: "حالة مزمنة",
  high_risk: "خطورة عالية",
  no_show_risk: "كتير بيتغيّب",
  insurance: "تأمين",
};

const tagTone: Record<string, "brand" | "warning" | "danger" | "neutral"> = {
  vip: "brand",
  chronic: "warning",
  high_risk: "danger",
  no_show_risk: "warning",
  insurance: "neutral",
};

const avatarColors = ["#7c5cff", "#ff8a3d", "#22b07d", "#e5484d", "#0ea5b0", "#c026d3", "#f59e0b"];
function avatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return avatarColors[Math.abs(hash) % avatarColors.length];
}

function shortDate(iso: string | null) {
  if (!iso) return "—";
  return formatDateShort(iso);
}

export function MyPatientsPage() {
  const [patients, setPatients] = useState<MyPatient[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const toast = useToast();

  useEffect(() => {
    getMyPatients()
      .then(setPatients)
      .catch((err) => toast.error(errorMessage(err)))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return patients;
    return patients.filter((p) => p.full_name.toLowerCase().includes(q) || p.phone.includes(q));
  }, [patients, search]);

  const withUpcoming = patients.filter((p) => p.next_appointment_at).length;
  const visits = patients.reduce((sum, p) => sum + p.visits_count, 0);

  const columns: Column<MyPatient>[] = [
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
            {p.full_name.replace(/^د\.\s*/, "").trim()[0] ?? ""}
          </span>
          <span className="min-w-0">
            <span className="block truncate font-semibold text-heading">{p.full_name}</span>
            {p.tags.length > 0 && (
              <span className="mt-1 flex flex-wrap gap-1">
                {p.tags.map((t) => (
                  <Badge key={t} tone={tagTone[t] ?? "neutral"}>
                    {tagLabel[t] ?? t}
                  </Badge>
                ))}
              </span>
            )}
          </span>
        </div>
      ),
    },
    {
      key: "phone",
      header: "الهاتف",
      sortValue: (p) => p.phone,
      cell: (p) => (
        <span className="tabular-nums" dir="ltr">
          {p.phone}
        </span>
      ),
    },
    {
      key: "visits",
      header: "الزيارات",
      align: "end",
      sortValue: (p) => p.visits_count,
      cell: (p) => <span className="font-bold text-heading tabular-nums">{formatNumber(p.visits_count)}</span>,
    },
    {
      key: "last",
      header: "آخر زيارة",
      sortValue: (p) => p.last_visit_at,
      cell: (p) => <span className="whitespace-nowrap tabular-nums">{shortDate(p.last_visit_at)}</span>,
    },
    {
      key: "next",
      header: "الموعد القادم",
      sortValue: (p) => p.next_appointment_at,
      cell: (p) =>
        p.next_appointment_at ? (
          <Badge tone="brand">{shortDate(p.next_appointment_at)}</Badge>
        ) : (
          <span className="text-faint">—</span>
        ),
    },
    {
      key: "notes",
      header: "ملاحظات",
      secondary: true,
      cell: (p) => <span className="line-clamp-2 max-w-[24ch] text-[13px] text-muted">{p.notes ?? "—"}</span>,
    },
  ];

  return (
    <PageBody>
      <PageHeader
        eyebrow="شغلي"
        title="مرضاي"
        description="المرضى اللي عندك معهم مواعيد — عدد الزيارات وآخر زيارة محسوبة من مواعيدك إنت بس."
      />

      <StatGrid className="xl:grid-cols-3">
        <StatCard index={0} label="مريض إلك" value={patients.length} icon={<PatientIcon />} tone="brand" loading={loading} />
        <StatCard index={1} label="عندهم موعد قادم" value={withUpcoming} icon={<AppointmentIcon />} tone="teal" loading={loading} />
        <StatCard index={2} label="إجمالي الزيارات" value={visits} icon={<PatientIcon />} tone="amber" loading={loading} />
      </StatGrid>

      {patients.length > 0 && (
        <TableToolbar>
          <Input
            className="w-full sm:w-80"
            label="بحث"
            placeholder="ابحث بالاسم أو الهاتف..."
            icon={<SearchIcon />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </TableToolbar>
      )}

      <DataTable
        rows={rows}
        columns={columns}
        getRowKey={(p) => p.id}
        loading={loading}
        initialSort={{ key: "next", dir: "asc" }}
        empty={
          search ? (
            <EmptyState
              icon={<PatientIcon />}
              title="ما في مريض مطابق للبحث"
              action={<Button onClick={() => setSearch("")}>مسح البحث</Button>}
            />
          ) : (
            <EmptyState
              icon={<PatientIcon />}
              title="لسا ما عندك مرضى"
              description="أول ما ينحجزلك موعد، بيظهر المريض هون مع سجل زياراته معك."
            />
          )
        }
      />
    </PageBody>
  );
}
