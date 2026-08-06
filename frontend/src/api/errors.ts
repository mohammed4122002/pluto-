import { AxiosError } from "axios";

/** The backend always answers with an Arabic `detail`; axios's own `message`
 * ("Request failed with status code 403") is English and meaningless to a
 * receptionist. Pages used to pick one or the other at random — this is the
 * single place that decides. */
export function errorMessage(err: unknown): string {
  const detail = (err as AxiosError<{ detail?: string }>)?.response?.data?.detail;
  if (typeof detail === "string" && detail.trim()) return detail;
  if (err instanceof AxiosError && !err.response) return "تعذّر الوصول للخادم — تحقق من الاتصال.";
  return "صار خطأ غير متوقع. حاول مرة تانية.";
}
