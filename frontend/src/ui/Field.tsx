import { forwardRef, useId } from "react";
import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { cn } from "./cn";

/* One control skin, shared by input/select/textarea so a form never shows
 * three slightly different box heights in the same row. */
const control =
  "w-full appearance-none rounded-xl border border-line bg-surface px-3.5 font-sans text-sm text-heading transition " +
  "placeholder:text-faint " +
  "hover:not-disabled:border-line-strong " +
  "focus:border-brand focus:ring-4 focus:ring-[var(--accent-ring)] focus:outline-none " +
  "disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-muted";

const invalid = "border-danger focus:border-danger focus:ring-danger-bg";

/** Label + control + hint/error, wired together with a generated id so the
 * label actually points at its control (the hand-rolled forms mostly didn't,
 * which is why tapping a label did nothing on a phone). */
export function Field({
  label,
  hint,
  error,
  required,
  htmlFor,
  className,
  children,
}: {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  htmlFor?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      {label && (
        <label htmlFor={htmlFor} className="text-[13px] font-semibold text-heading">
          {label}
          {required && <span className="ms-1 text-danger">*</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="text-xs font-medium text-danger">{error}</p>
      ) : hint ? (
        <p className="text-xs text-faint">{hint}</p>
      ) : null}
    </div>
  );
}

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  icon?: ReactNode;
  fieldClassName?: string;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, icon, className, fieldClassName, id, required, ...rest },
  ref,
) {
  const auto = useId();
  const inputId = id ?? auto;
  const field = (
    <div className="relative">
      {icon && (
        <span className="pointer-events-none absolute inset-y-0 start-3 grid place-items-center text-faint [&_svg]:size-[18px]">
          {icon}
        </span>
      )}
      <input
        ref={ref}
        id={inputId}
        required={required}
        aria-invalid={error ? true : undefined}
        className={cn(control, "h-10", icon && "ps-10", error && invalid, className)}
        {...rest}
      />
    </div>
  );
  if (!label && !hint && !error) return field;
  return (
    <Field label={label} hint={hint} error={error} required={required} htmlFor={inputId} className={fieldClassName}>
      {field}
    </Field>
  );
});

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  fieldClassName?: string;
};

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, error, className, fieldClassName, id, required, children, ...rest },
  ref,
) {
  const auto = useId();
  const selectId = id ?? auto;
  const field = (
    <div className="relative">
      <select
        ref={ref}
        id={selectId}
        required={required}
        aria-invalid={error ? true : undefined}
        className={cn(control, "h-10 cursor-pointer appearance-none pe-9", error && invalid, className)}
        {...rest}
      >
        {children}
      </select>
      {/* The native arrow is dropped by `appearance-none` above; this one
          sits on the inline-end edge, which RTL flips for free. */}
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="pointer-events-none absolute inset-y-0 end-3 my-auto size-4 text-faint"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </div>
  );
  if (!label && !hint && !error) return field;
  return (
    <Field label={label} hint={hint} error={error} required={required} htmlFor={selectId} className={fieldClassName}>
      {field}
    </Field>
  );
});

export type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  fieldClassName?: string;
};

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, error, className, fieldClassName, id, required, rows = 3, ...rest },
  ref,
) {
  const auto = useId();
  const areaId = id ?? auto;
  const field = (
    <textarea
      ref={ref}
      id={areaId}
      rows={rows}
      required={required}
      aria-invalid={error ? true : undefined}
      className={cn(control, "resize-y py-2.5 leading-6", error && invalid, className)}
      {...rest}
    />
  );
  if (!label && !hint && !error) return field;
  return (
    <Field label={label} hint={hint} error={error} required={required} htmlFor={areaId} className={fieldClassName}>
      {field}
    </Field>
  );
});

export function Checkbox({
  label,
  description,
  className,
  id,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode; description?: ReactNode }) {
  const auto = useId();
  const boxId = id ?? auto;
  return (
    <div className={cn("flex items-start gap-2.5", className)}>
      <input
        id={boxId}
        type="checkbox"
        className="mt-0.5 size-[18px] shrink-0 cursor-pointer accent-[var(--accent)]"
        {...rest}
      />
      <label htmlFor={boxId} className="cursor-pointer text-sm text-heading select-none">
        {label}
        {description && <span className="mt-0.5 block text-xs text-muted">{description}</span>}
      </label>
    </div>
  );
}

/** Two columns on a desk, one on a phone -- the default shape of every form
 * in the app. `span` lets a wide control (a note, a patient picker) take the
 * full row. */
export function FormGrid({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("grid grid-cols-1 gap-4 sm:grid-cols-2", className)}>{children}</div>;
}

export function FormRow({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("sm:col-span-2", className)}>{children}</div>;
}
