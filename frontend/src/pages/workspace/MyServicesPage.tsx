import { useEffect, useState } from "react";
import { getMyServices } from "../../api/me";
import type { MyService } from "../../api/me";
import { errorMessage } from "../../api/errors";
import { formatMoney, formatNumber } from "../../format";
import { AppointmentIcon, SearchIcon, ServiceIcon } from "../../icons";
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

export function MyServicesPage() {
  const [services, setServices] = useState<MyService[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const toast = useToast();

  useEffect(() => {
    getMyServices()
      .then(setServices)
      .catch((err) => toast.error(errorMessage(err)))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const q = search.trim().toLowerCase();
  const rows = q ? services.filter((s) => s.name.toLowerCase().includes(q)) : services;
  const upcoming = services.reduce((sum, s) => sum + s.upcoming_appointments, 0);

  const columns: Column<MyService>[] = [
    {
      key: "name",
      header: "الخدمة",
      primary: true,
      sortValue: (s) => s.name,
      cell: (s) => (
        <div className="min-w-0">
          <div className="truncate font-semibold text-heading">{s.name}</div>
          {s.description && <div className="truncate text-xs text-muted">{s.description}</div>}
        </div>
      ),
    },
    {
      key: "specialty",
      header: "التخصص",
      secondary: true,
      sortValue: (s) => s.specialty_name,
      cell: (s) => <Badge>{s.specialty_name ?? "—"}</Badge>,
    },
    {
      key: "duration",
      header: "المدة",
      sortValue: (s) => s.duration_minutes,
      cell: (s) => <span className="whitespace-nowrap tabular-nums">{formatNumber(s.duration_minutes)} دقيقة</span>,
    },
    {
      key: "price",
      header: "السعر",
      align: "end",
      sortValue: (s) => s.price,
      cell: (s) => (
        <span className="font-bold text-heading tabular-nums">{s.price != null ? formatMoney(s.price) : "—"}</span>
      ),
    },
    {
      key: "upcoming",
      header: "مواعيد قادمة",
      align: "end",
      sortValue: (s) => s.upcoming_appointments,
      cell: (s) => <span className="tabular-nums">{formatNumber(s.upcoming_appointments)}</span>,
    },
    {
      key: "status",
      header: "الحالة",
      cell: (s) => (
        <Badge tone={s.is_active ? "success" : "neutral"} dot>
          {s.is_active ? "فعّالة" : "موقوفة"}
        </Badge>
      ),
    },
  ];

  return (
    <PageBody>
      <PageHeader eyebrow="شغلي" title="خدماتي" description="الخدمات المربوطة فيك، ومدّة وسعر كل وحدة." />

      <StatGrid className="xl:grid-cols-2">
        <StatCard index={0} label="خدمة مربوطة فيك" value={services.length} icon={<ServiceIcon />} tone="brand" loading={loading} />
        <StatCard index={1} label="مواعيد قادمة عليها" value={upcoming} icon={<AppointmentIcon />} tone="teal" loading={loading} />
      </StatGrid>

      {services.length > 0 && (
        <TableToolbar>
          <Input
            className="w-full sm:w-80"
            label="بحث"
            placeholder="ابحث بالاسم..."
            icon={<SearchIcon />}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </TableToolbar>
      )}

      <DataTable
        rows={rows}
        columns={columns}
        getRowKey={(s) => s.id}
        loading={loading}
        empty={
          // Distinct from "no search results" on purpose -- an empty catalogue
          // here means an admin never linked this doctor to a service, and the
          // doctor can't fix that themselves.
          q ? (
            <EmptyState
              icon={<ServiceIcon />}
              title="ما في خدمة بهاد الاسم"
              action={<Button onClick={() => setSearch("")}>مسح البحث</Button>}
            />
          ) : (
            <EmptyState
              icon={<ServiceIcon />}
              title="ما في خدمات مربوطة فيك"
              description="تواصل مع الإدارة ليربطوا خدماتك — بعدها بتقدر تستقبل حجوزات عليها."
            />
          )
        }
      />
    </PageBody>
  );
}
