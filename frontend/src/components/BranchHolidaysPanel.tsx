import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { createHoliday, deleteHoliday, listHolidays } from "../api/holidays";
import type { BranchHoliday } from "../api/holidays";

/** Declaring a closure also takes that day's still-open slots off the market,
 * so the count the API reports back is shown to the person doing it -- without
 * it there is no way to tell a holiday that closed 40 appointments apart from
 * one that closed none. */
export function BranchHolidaysPanel({ branchId, branchName }: { branchId: string; branchName: string }) {
  const [holidays, setHolidays] = useState<BranchHoliday[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [holidayDate, setHolidayDate] = useState("");
  const [reason, setReason] = useState("");
  const [isFullDay, setIsFullDay] = useState(true);
  const [startTime, setStartTime] = useState("14:00");
  const [endTime, setEndTime] = useState("17:00");

  useEffect(() => {
    setLoading(true);
    setError(null);
    listHolidays(branchId)
      .then(setHolidays)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [branchId]);

  const add = (e: FormEvent) => {
    e.preventDefault();
    if (!holidayDate) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    createHoliday({
      branch_id: branchId,
      holiday_date: holidayDate,
      reason,
      is_full_day: isFullDay,
      start_time: isFullDay ? null : startTime,
      end_time: isFullDay ? null : endTime,
    })
      .then((result) => {
        setHolidays((prev) =>
          [...prev, result.holiday].sort((a, b) => a.holiday_date.localeCompare(b.holiday_date)),
        );
        setNotice(
          result.blocked_slots > 0
            ? `تم تسجيل العطلة، وتم إغلاق ${result.blocked_slots} موعد كان متاحاً بهذا اليوم.`
            : "تم تسجيل العطلة. ما كان في مواعيد متاحة بهذا اليوم أصلاً.",
        );
        setHolidayDate("");
        setReason("");
      })
      .catch((err) => setError(err.response?.data?.detail ?? err.message))
      .finally(() => setSaving(false));
  };

  const remove = (holiday: BranchHoliday) => {
    setError(null);
    setNotice(null);
    deleteHoliday(holiday.id)
      .then((result) => {
        setHolidays((prev) => prev.filter((h) => h.id !== holiday.id));
        setNotice(
          result.reopened_slots > 0
            ? `تم إلغاء العطلة، وتم إعادة فتح ${result.reopened_slots} موعد.`
            : "تم إلغاء العطلة.",
        );
      })
      .catch((err) => setError(err.response?.data?.detail ?? err.message));
  };

  return (
    <div className="data-form">
      <p className="data-form-title">عطل وإغلاقات — {branchName}</p>
      <p className="page-header-subtitle">
        الأيام اللي الفرع مسكّر فيها. تسجيل عطلة بيغلق المواعيد المتاحة بذاك اليوم فوراً،
        وما بيتولّد مواعيد جديدة فيه.
      </p>

      {error && <p className="error">{error}</p>}
      {notice && <p className="badge active">{notice}</p>}

      <form onSubmit={add}>
        <input
          type="date"
          value={holidayDate}
          onChange={(e) => setHolidayDate(e.target.value)}
          required
        />
        <input
          placeholder="السبب (مثلاً: عيد الاستقلال)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <label>
          <input type="checkbox" checked={isFullDay} onChange={(e) => setIsFullDay(e.target.checked)} />
          يوم كامل
        </label>
        {!isFullDay && (
          <>
            <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </>
        )}
        <button type="submit" disabled={saving}>
          {saving ? "..." : "إضافة عطلة"}
        </button>
      </form>

      {loading ? (
        <p>جاري التحميل...</p>
      ) : holidays.length === 0 ? (
        <p>ما في عطل مسجّلة لهذا الفرع.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>التاريخ</th>
              <th>السبب</th>
              <th>المدة</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {holidays.map((h) => (
              <tr key={h.id}>
                <td>{h.holiday_date}</td>
                <td>{h.reason || "—"}</td>
                <td>
                  {h.is_full_day ? "يوم كامل" : `${h.start_time?.slice(0, 5)} - ${h.end_time?.slice(0, 5)}`}
                </td>
                <td>
                  <button onClick={() => remove(h)}>إلغاء العطلة</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
