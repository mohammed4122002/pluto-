import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";
import { Spinner } from "./Spinner";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "soft"
  | "danger"
  | "danger-soft"
  | "inverse"
  | "inverse-ghost";
export type ButtonSize = "sm" | "md" | "lg";

/* One gradient for the primary action, a flat surface for everything beside
 * it. The gradient is kept for hover/active via `brightness` rather than
 * swapped for a solid colour, so the button doesn't flatten out mid-press. */
const variants: Record<ButtonVariant, string> = {
  primary:
    "border border-transparent bg-[image:var(--accent-gradient)] text-on-brand shadow-[var(--accent-glow)] " +
    "hover:not-disabled:brightness-110 hover:not-disabled:shadow-[var(--shadow-btn-hover)] hover:not-disabled:-translate-y-px " +
    "active:not-disabled:translate-y-0 active:not-disabled:brightness-95",
  secondary:
    "bg-surface text-heading border border-line shadow-[var(--shadow-xs)] hover:not-disabled:border-brand-border " +
    "hover:not-disabled:bg-brand-bg hover:not-disabled:text-brand",
  ghost: "border border-transparent bg-transparent text-fg hover:not-disabled:bg-hover hover:not-disabled:text-heading",
  soft: "bg-brand-bg text-brand border border-transparent hover:not-disabled:border-brand-border",
  danger:
    "border border-transparent bg-danger text-white hover:not-disabled:brightness-110 active:not-disabled:brightness-95",
  "danger-soft":
    "bg-danger-bg text-danger border border-transparent hover:not-disabled:border-danger-border",
  /* For the brand-wash page header, where the surrounding colour is the
     accent itself: a filled accent button would disappear into it. */
  inverse:
    "border border-transparent bg-white text-[#4c23d6] shadow-[0_8px_20px_-8px_rgba(0,0,0,0.45)] hover:not-disabled:bg-white/90",
  "inverse-ghost":
    "bg-white/12 text-white border border-white/25 backdrop-blur-sm hover:not-disabled:bg-white/20",
};

const sizes: Record<ButtonSize, string> = {
  sm: "h-8 gap-1.5 px-3 text-[12.5px] rounded-[9px]",
  md: "h-10 gap-2 px-4 text-[13.5px] rounded-[11px]",
  lg: "h-12 gap-2.5 px-6 text-[15px] rounded-[13px]",
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner and blocks the click without collapsing the button's
   * width -- the label stays put so a row of buttons doesn't reflow. */
  loading?: boolean;
  icon?: ReactNode;
  iconEnd?: ReactNode;
  block?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "secondary",
    size = "md",
    loading = false,
    icon,
    iconEnd,
    block,
    className,
    children,
    disabled,
    type = "button",
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        // `appearance-none` + an explicit font: without Preflight, a button
        // otherwise keeps the platform's own control chrome and system font.
        "inline-flex shrink-0 cursor-pointer appearance-none items-center justify-center font-sans font-semibold whitespace-nowrap",
        "transition-[background-color,border-color,color,box-shadow,filter,transform] duration-150",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
        "disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none",
        variants[variant],
        sizes[size],
        block && "w-full",
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner /> : icon}
      {children}
      {iconEnd}
    </button>
  );
});

/** Square, label-less button for toolbars and table rows. `title` is not
 * optional in practice -- an icon with no accessible name is a dead end for
 * a screen reader -- so it doubles as the aria-label.
 *
 * forwardRef because menus anchor their panel to the trigger's box, and the
 * trigger is usually one of these. */
export const IconButton = forwardRef<
  HTMLButtonElement,
  Omit<ButtonProps, "icon" | "iconEnd" | "block"> & { title: string }
>(function IconButton({ title, size = "md", variant = "ghost", className, children, ...rest }, ref) {
  const box =
    size === "sm" ? "size-8 rounded-[9px]" : size === "lg" ? "size-12 rounded-[13px]" : "size-10 rounded-[11px]";
  return (
    <Button
      ref={ref}
      variant={variant}
      size={size}
      title={title}
      aria-label={title}
      className={cn("px-0", box, className)}
      {...rest}
    >
      {children}
    </Button>
  );
});
