import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "./cn";

export type MenuItem = {
  key: string;
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  disabled?: boolean;
  /** Renders in the danger tone and sits under a divider. */
  danger?: boolean;
  /** Shows a check beside the item -- for menus that pick a value. */
  checked?: boolean;
  /** Explains a disabled item on hover. */
  title?: string;
};

/** Dropdown menu anchored to whatever triggers it.
 *
 * Rendered in a portal with fixed positioning rather than absolutely inside
 * the trigger's parent: these open from table rows, and a table scrolls
 * inside an `overflow` container that would otherwise clip the panel to the
 * row it belongs to. The trade-off is that the panel has to be re-placed on
 * scroll -- so it closes instead, which is also what a user expects when the
 * thing they opened it from moves.
 *
 * Long lists (every appointment status) scroll inside the panel. */
const PANEL_W = 268;

export function Menu({
  trigger,
  items,
  align = "end",
  label,
  className,
}: {
  /** Receives the props the trigger element must spread. */
  trigger: (props: {
    ref: React.Ref<HTMLButtonElement>;
    onClick: () => void;
    "aria-expanded": boolean;
    "aria-haspopup": "menu";
  }) => ReactNode;
  items: MenuItem[];
  /** Which edge of the trigger the panel lines up with, in logical terms. */
  align?: "start" | "end";
  /** Accessible name for the panel. */
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const rtl = document.documentElement.dir === "rtl";
    const clamp = (v: number) => Math.min(Math.max(v, 8), window.innerWidth - PANEL_W - 8);
    // The panel hangs from the trigger's inline-start edge -- the right one
    // under RTL -- unless the caller asks for the other end.
    const startAligned = align === "start" ? rtl : !rtl;
    const left = clamp(startAligned ? rect.right - PANEL_W : rect.left);

    // Flip above the trigger when the space below can't hold the panel: a
    // menu opened from the last row of a table would otherwise render mostly
    // off-screen.
    const height = Math.min(items.length * 38 + 12, 352);
    const below = window.innerHeight - rect.bottom - 12;
    const top = below < height && rect.top > height ? rect.top - height - 6 : rect.bottom + 6;
    setPos({ left, top });
  }, [open, align, items.length]);

  // Long menus (every appointment status) open on the current value rather
  // than at the top, where it may be 20 rows out of sight.
  //
  // Done by arithmetic on the panel's own scrollTop rather than with
  // scrollIntoView: that method walks up and scrolls whatever ancestor it has
  // to, which here was the page itself -- and a page scroll fires the very
  // event this menu closes on, so opening a status menu closed it in the same
  // frame. Confirmed live: the status badge looked like a dead button while
  // the actions menu (no checked item, so no scroll) worked fine.
  useEffect(() => {
    if (!open || !pos) return;
    const panel = panelRef.current;
    const checked = panel?.querySelector<HTMLElement>('[data-checked="true"]');
    if (!panel || !checked) return;
    panel.scrollTop = Math.max(0, checked.offsetTop - panel.clientHeight / 2 + checked.offsetHeight / 2);
  }, [open, pos]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onDown = (e: MouseEvent) => {
      if (panelRef.current?.contains(e.target as Node)) return;
      if (triggerRef.current?.contains(e.target as Node)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
        triggerRef.current?.focus();
      }
    };
    // A scroll anywhere else moves the trigger out from under the panel, so
    // the menu closes -- but scrolling *inside* the panel is how you reach
    // the rest of a long list, and must not.
    const onScroll = (e: Event) => {
      if (panelRef.current?.contains(e.target as Node)) return;
      close();
    };

    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  const dangerFrom = items.findIndex((i) => i.danger);

  return (
    <>
      {trigger({
        ref: triggerRef,
        onClick: () => setOpen((v) => !v),
        "aria-expanded": open,
        "aria-haspopup": "menu",
      })}
      {open &&
        pos &&
        createPortal(
          <div
            ref={panelRef}
            role="menu"
            aria-label={label}
            data-ui
            className={cn(
              "fixed z-50 max-h-[22rem] animate-pop-in overflow-y-auto rounded-[14px] bg-surface p-1.5 font-sans",
              "shadow-[var(--shadow-lg),var(--hairline)]",
              className,
            )}
            style={{ top: pos.top, left: pos.left, width: PANEL_W }}
          >
            {items.map((item, i) => (
              <div key={item.key}>
                {dangerFrom > 0 && i === dangerFrom && <hr className="my-1 border-0 border-t border-line" />}
                <button
                  type="button"
                  role="menuitem"
                  disabled={item.disabled}
                  data-checked={item.checked ? "true" : undefined}
                  title={item.title}
                  onClick={() => {
                    setOpen(false);
                    item.onSelect();
                  }}
                  className={cn(
                    "flex w-full cursor-pointer appearance-none items-center gap-2.5 rounded-[9px] border-0 bg-transparent px-2.5 py-2 text-start font-sans text-[13px] font-semibold transition",
                    "disabled:cursor-not-allowed disabled:opacity-45",
                    item.danger
                      ? "text-danger hover:not-disabled:bg-danger-bg"
                      : "text-fg hover:not-disabled:bg-hover hover:not-disabled:text-heading",
                  )}
                >
                  <span className="grid size-4 shrink-0 place-items-center [&_svg]:size-4">
                    {item.checked ? (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m5 13 4 4L19 7" />
                      </svg>
                    ) : (
                      item.icon
                    )}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                </button>
              </div>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
