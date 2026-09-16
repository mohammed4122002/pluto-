import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "./cn";
import { Button } from "./Button";
import type { ButtonVariant } from "./Button";

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** Number of overlays currently open. The body scroll lock is refcounted
 * because a drawer can legitimately open a confirm dialog on top of itself,
 * and the inner one closing must not unlock the page behind the outer one. */
let openOverlays = 0;

function useOverlayBehaviour(onClose: () => void, panelRef: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const restoreTo = document.activeElement as HTMLElement | null;

    openOverlays += 1;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Focus the panel itself rather than its first control: dropping the
    // caret straight into a text box makes a screen reader skip the title,
    // and on a drawer full of fields the first one is rarely the one you
    // want. The panel carries tabIndex={-1} for exactly this.
    panelRef.current?.focus({ preventScroll: true });

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const panel = panelRef.current;
      if (!panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      if (items.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === panel)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      openOverlays -= 1;
      if (openOverlays === 0) document.body.style.overflow = previousOverflow;
      restoreTo?.focus?.({ preventScroll: true });
    };
  }, [onClose, panelRef]);
}

function Scrim({ onClose, className }: { onClose: () => void; className?: string }) {
  return (
    <div
      // A click on the backdrop closes; the panel stops propagation itself,
      // so no stopPropagation gymnastics are needed on every child.
      onMouseDown={onClose}
      className={cn("absolute inset-0 bg-overlay backdrop-blur-[2px] animate-fade-in", className)}
    />
  );
}

export type DialogSize = "sm" | "md" | "lg" | "xl";

const dialogSizes: Record<DialogSize, string> = {
  sm: "max-w-md",
  md: "max-w-xl",
  lg: "max-w-3xl",
  xl: "max-w-5xl",
};

/** Centred modal for short, self-contained tasks: a confirmation, a status
 * change, a form of up to a handful of fields. Anything longer belongs in a
 * Drawer, which keeps the row you came from visible beside it. */
export function Dialog({
  open = true,
  title,
  description,
  onClose,
  size = "md",
  footer,
  children,
}: {
  open?: boolean;
  title: ReactNode;
  description?: ReactNode;
  onClose: () => void;
  size?: DialogSize;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => onClose(), [onClose]);
  useOverlayBehaviour(close, panelRef);
  if (!open) return null;

  return createPortal(
    <div data-ui className="fixed inset-0 z-50 font-sans" role="presentation">
      <Scrim onClose={close} />
      <div className="absolute inset-0 grid place-items-center overflow-y-auto p-4">
        <div
          ref={panelRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-label={typeof title === "string" ? title : undefined}
          onMouseDown={(e) => e.stopPropagation()}
          className={cn(
            "relative w-full animate-pop-in rounded-2xl border border-line bg-surface shadow-[var(--shadow-lg)] outline-none",
            dialogSizes[size],
          )}
        >
          <DialogHeader title={title} description={description} onClose={close} />
          <div className="max-h-[70svh] overflow-y-auto px-5 py-4 text-sm text-fg">{children}</div>
          {footer && (
            <div className="flex flex-wrap items-center justify-end gap-2 rounded-b-2xl border-t border-line bg-surface-2 px-5 py-3.5">
              {footer}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Side sheet for long forms and record details -- it keeps the list behind
 * it on screen, which is what makes "book an appointment" feel like part of
 * the schedule rather than a detour away from it. */
export function Drawer({
  open = true,
  title,
  description,
  onClose,
  footer,
  children,
  width = "md",
}: {
  open?: boolean;
  title: ReactNode;
  description?: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
  children: ReactNode;
  width?: "md" | "lg";
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => onClose(), [onClose]);
  useOverlayBehaviour(close, panelRef);
  if (!open) return null;

  return createPortal(
    <div data-ui className="fixed inset-0 z-50 font-sans" role="presentation">
      <Scrim onClose={close} />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? title : undefined}
        onMouseDown={(e) => e.stopPropagation()}
        // CSS transforms are physical, not logical: a panel pinned to the
        // inline-start edge starts off-screen to the right under RTL and to
        // the left under LTR, so the offset is read from the document.
        style={
          {
            "--slide-from": document.documentElement.dir === "rtl" ? "100%" : "-100%",
          } as React.CSSProperties
        }
        className={cn(
          "absolute inset-y-0 start-0 flex w-full animate-slide-start flex-col border-e border-line bg-surface shadow-[var(--shadow-lg)] outline-none",
          width === "lg" ? "sm:max-w-2xl" : "sm:max-w-xl",
        )}
      >
        <DialogHeader title={title} description={description} onClose={close} />
        <div className="flex-1 overflow-y-auto px-5 py-4 text-sm text-fg">{children}</div>
        {footer && (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-surface-2 px-5 py-3.5">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

function DialogHeader({
  title,
  description,
  onClose,
}: {
  title: ReactNode;
  description?: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
      <div className="min-w-0">
        <h2 className="text-base leading-6 font-bold text-heading">{title}</h2>
        {description && <p className="mt-1 text-[13px] leading-5 text-muted">{description}</p>}
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="إغلاق"
        className="grid size-8 shrink-0 cursor-pointer appearance-none place-items-center rounded-lg border-0 bg-transparent p-0 text-muted transition hover:bg-hover hover:text-heading focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="m6 6 12 12M18 6 6 18" />
        </svg>
      </button>
    </div>
  );
}

/** Destructive-action gate. Async `onConfirm` keeps the dialog open with the
 * button in its loading state until the request settles, so a slow cancel
 * can't be fired twice. */
export function ConfirmDialog({
  title,
  description,
  confirmLabel = "تأكيد",
  cancelLabel = "إلغاء",
  tone = "danger",
  onConfirm,
  onClose,
  children,
}: {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: Extract<ButtonVariant, "danger" | "primary">;
  onConfirm: () => void | Promise<unknown>;
  onClose: () => void;
  children?: ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Dialog
      title={title}
      description={description}
      size="sm"
      onClose={busy ? () => undefined : onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button
            variant={tone}
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm();
              } finally {
                setBusy(false);
              }
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
    </Dialog>
  );
}
