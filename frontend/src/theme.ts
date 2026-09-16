import { useState } from "react";

export type Theme = "light" | "dark";

/** The active theme, explicit-choice-or-system.
 *
 * The inline script in index.html stamps the resolved theme on <html> before
 * paint, so reading the attribute back here (rather than re-reading
 * localStorage) is what keeps this in sync with what is actually on screen.
 * The attribute is always present, which is what lets the stylesheet's
 * `dark:` variant be a plain attribute check. */
export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(
    () => (document.documentElement.getAttribute("data-theme") as Theme | null) ?? "light",
  );

  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("pluto_theme", next);
    setTheme(next);
  };

  return [theme, toggle];
}
