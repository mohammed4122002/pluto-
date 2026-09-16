import { useEffect, useState } from "react";
import { dismissPatientDuplicate, listPatientDuplicates, mergePatientDuplicate } from "../api/patients";
import type { PatientDuplicate } from "../api/patients";
import { formatNumber } from "../format";
import { CheckCircleIcon, DuplicatesIcon, XCircleIcon } from "../icons";
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  DataTable,
  EmptyState,
  PageBody,
  PageHeader,
  StatCard,
  StatGrid,
  useToast,
} from "../ui";
import type { Column } from "../ui";

const reasonLabels: Record<string, string> = {
  same_phone: "نفس رقم الهاتف",
  similar_name: "اسم متشابه",
  same_name_and_dob: "نفس الاسم وتاريخ الميلاد",
};

/** Which record survives a merge. Named rather than boolean so the confirm
 * dialog can say whose history is about to absorb the other's. */
type Merge = { dup: PatientDuplicate; survivorId: string; survivorName: string | null; mergedName: string | null };

export function PatientDuplicatesPage() {
  const [duplicates, setDuplicates] = useState<PatientDuplicate[]>([]);
  const [loading, setLoading] = useState(true);
  const [merging, setMerging] = useState<Merge | null>(null);
  const toast = useToast();

  const fail = (err: { response?: { data?: { detail?: string } }; message: string }) =>
    toast.error(err.response?.data?.detail ?? err.message);

  const load = () => {
    setLoading(true);
    listPatientDuplicates("pending")
      .then(setDuplicates)
      .catch(fail)
      .finally(() => setLoading(false));
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, []);

  const confirmMerge = (merge: Merge) =>
    mergePatientDuplicate(merge.dup.id, merge.survivorId)
      .then(() => {
        toast.success(`تم الدمج — السجل الباقي: ${merge.survivorName ?? ""}`);
        setDuplicates((prev) => prev.filter((d) => d.id !== merge.dup.id));
        setMerging(null);
      })
      .catch(fail);

  const handleDismiss = (dup: PatientDuplicate) =>
    dismissPatientDuplicate(dup.id)
      .then(() => {
        setDuplicates((prev) => prev.filter((d) => d.id !== dup.id));
        toast.success("تم تجاهل التطابق.");
      })
      .catch(fail);

  const strong = duplicates.filter((d) => d.match_score >= 90).length;

  const columns: Column<PatientDuplicate>[] = [
    {
      key: "a",
      header: "السجل الأول",
      primary: true,
      sortValue: (d) => d.patient_a_name,
      cell: (d) => (
        <div className="min-w-0">
          <div className="truncate font-semibold text-heading">{d.patient_a_name}</div>
          <div className="text-xs text-muted" dir="ltr">
            {d.patient_a_phone}
          </div>
        </div>
      ),
    },
    {
      key: "b",
      header: "السجل الثاني",
      sortValue: (d) => d.patient_b_name,
      cell: (d) => (
        <div className="min-w-0">
          <div className="truncate font-semibold text-heading">{d.patient_b_name}</div>
          <div className="text-xs text-muted" dir="ltr">
            {d.patient_b_phone}
          </div>
        </div>
      ),
    },
    {
      key: "score",
      header: "نسبة التطابق",
      align: "end",
      sortValue: (d) => d.match_score,
      cell: (d) => (
        <Badge tone={d.match_score >= 90 ? "danger" : d.match_score >= 75 ? "warning" : "neutral"}>
          {formatNumber(d.match_score)}%
        </Badge>
      ),
    },
    {
      key: "reason",
      header: "السبب",
      secondary: true,
      cell: (d) => (
        <span className="text-[13px] text-muted">{d.match_reasons.map((r) => reasonLabels[r] ?? r).join("، ")}</span>
      ),
    },
    {
      key: "actions",
      header: "الإجراء",
      align: "end",
      cell: (d) => (
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <Button
            size="sm"
            variant="soft"
            onClick={() =>
              setMerging({ dup: d, survivorId: d.patient_a_id, survivorName: d.patient_a_name, mergedName: d.patient_b_name })
            }
          >
            أبقِ الأول
          </Button>
          <Button
            size="sm"
            variant="soft"
            onClick={() =>
              setMerging({ dup: d, survivorId: d.patient_b_id, survivorName: d.patient_b_name, mergedName: d.patient_a_name })
            }
          >
            أبقِ الثاني
          </Button>
          <Button size="sm" icon={<XCircleIcon className="size-4" />} onClick={() => handleDismiss(d)}>
            ليسا نفس الشخص
          </Button>
        </div>
      ),
    },
  ];

  return (
    <PageBody>
      <PageHeader
        eyebrow="المرضى والمالية"
        title="السجلات المكررة"
        description="عند إضافة مريض جديد يقارنه النظام بالمرضى الموجودين (بالهاتف والاسم وتاريخ الميلاد). الأزواج المتشابهة بتظهر هنا للمراجعة: إمّا دمجها بسجل واحد، أو تجاهلها إذا مش نفس الشخص."
      />

      <StatGrid className="xl:grid-cols-2">
        <StatCard
          index={0}
          label="أزواج بانتظار المراجعة"
          value={duplicates.length}
          icon={<DuplicatesIcon />}
          tone="brand"
          loading={loading}
        />
        <StatCard
          index={1}
          label="تطابق قوي (٩٠٪ فأعلى)"
          value={strong}
          icon={<DuplicatesIcon />}
          tone="rose"
          loading={loading}
          hint="على الأغلب نفس الشخص"
        />
      </StatGrid>

      {!loading && duplicates.length === 0 ? (
        <Card>
          <EmptyState
            icon={<CheckCircleIcon />}
            title="ما في سجلات مكررة"
            description="ولا زوج سجلات بحاجة مراجعة الآن — سجلات المرضى نظيفة."
          />
        </Card>
      ) : (
        <DataTable
          rows={duplicates}
          columns={columns}
          getRowKey={(d) => d.id}
          loading={loading}
          initialSort={{ key: "score", dir: "desc" }}
        />
      )}

      {merging && (
        <ConfirmDialog
          title="دمج السجلين"
          confirmLabel="تأكيد الدمج"
          tone="primary"
          onConfirm={() => confirmMerge(merging)}
          onClose={() => setMerging(null)}
        >
          <p className="text-[13px] leading-6 text-fg">
            سيبقى سجل <strong className="text-heading">«{merging.survivorName}»</strong> وينضم إليه كل ما في سجل{" "}
            <strong className="text-heading">«{merging.mergedName}»</strong> من مواعيد ومدفوعات ومحادثات. لا يمكن
            التراجع عن الدمج.
          </p>
        </ConfirmDialog>
      )}
    </PageBody>
  );
}
