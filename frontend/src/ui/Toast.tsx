import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "./cn";
import { ToastContext } from "./toast-context";
import type { ToastApi, ToastTone } from "./toast-context";

type Toast = { id: number; tone: ToastTone; message: string };

/** App-wide transient feedback.
 *
 * Replaces the per-page `notice` strings that used to push the table down a
 * row when they appeared and stayed until someone clicked "إخفاء". A toast
 * says the same thing without moving the content the user is looking at. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((all) => all.filter((t) => t.id !== id));
  }, []);

  const api = useMemo<ToastApi>(() => {
    const push = (message: string, tone: ToastTone = "info") => {
      const id = nextId.current++;
      setToasts((all) => [...all, { id, tone, message }]);
    };
    return {
      push,
      success: (message: string) => push(message, "success"),
      error: (message: string) => push(message, "error"),
    };
  }, []);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {createPortal(
        <div
          data-ui
          className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 font-sans sm:items-end"
          role="region"
          aria-label="الإشعارات"
        >
          {toasts.map((toast) => (
            <ToastRow key={toast.id} toast={toast} onDismiss={() => dismiss(toast.id)} />
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

const tones: Record<ToastTone, { box: string; icon: ReactNode }> = {
  success: {
    box: "border-success-border bg-success-bg text-success",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="m5 13 4 4L19 7" />
      </svg>
    ),
  },
  error: {
    box: "border-danger-border bg-danger-bg text-danger",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
        <path d="M12 7v7M12 17.5v.5" />
        <circle cx="12" cy="12" r="9" />
      </svg>
    ),
  },
  info: {
    box: "border-brand-border bg-brand-bg text-brand",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
        <path d="M12 11v6M12 7.5v.5" />
        <circle cx="12" cy="12" r="9" />
      </svg>
    ),
  },
};

function ToastRow({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  useEffect(() => {
    // Errors linger: they usually carry something the user has to read and
    // act on, while a success is just an acknowledgement.
    const ms = toast.tone === "error" ? 7000 : 4000;
    const timer = window.setTimeout(onDismiss, ms);
    return () => window.clearTimeout(timer);
  }, [toast.tone, onDismiss]);

  const tone = tones[toast.tone];
  return (
    <div
      role={toast.tone === "error" ? "alert" : "status"}
      className={cn(
        "pointer-events-auto flex w-full max-w-sm animate-pop-in items-start gap-2.5 rounded-xl border bg-surface px-4 py-3 shadow-[var(--shadow-md)]",
        tone.box,
      )}
    >
      <span className="mt-0.5 size-[18px] shrink-0 [&_svg]:size-[18px]" aria-hidden="true">
        {tone.icon}
      </span>
      <p className="flex-1 text-[13.5px] leading-5 font-medium text-heading">{toast.message}</p>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="إغلاق"
        className="-me-1 grid size-6 shrink-0 cursor-pointer appearance-none place-items-center rounded-md border-0 bg-transparent p-0 text-muted transition hover:bg-hover hover:text-heading"
      >
        <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="m6 6 12 12M18 6 6 18" />
        </svg>
      </button>
    </div>
  );
}
