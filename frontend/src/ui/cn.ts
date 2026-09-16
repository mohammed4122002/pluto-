/** Joins class names, keeping only the truthy strings.
 *
 * Deliberately not `clsx`: the only thing the kit ever needs is conditional
 * strings, and the later-class-wins merging that `tailwind-merge` adds isn't
 * something the components rely on -- every variant table produces one class
 * per property, so there is nothing to de-duplicate.
 *
 * The parameter is `unknown` rather than `string | false` so call sites can
 * write `cn(base, error && "...")` where `error` is a ReactNode: the guard's
 * falsy branch keeps whatever type it had, and this filter drops it. */
export function cn(...parts: unknown[]) {
  return parts.filter((part): part is string => typeof part === "string" && part !== "").join(" ");
}
