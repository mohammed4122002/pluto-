import { createContext, useContext } from "react";

export type ToastTone = "success" | "error" | "info";

export type ToastApi = {
  push: (message: string, tone?: ToastTone) => void;
  success: (message: string) => void;
  error: (message: string) => void;
};

/* Separate from Toast.tsx so that file exports components only -- a module
 * mixing components with plain values opts the whole file out of React Fast
 * Refresh, which means editing a toast during development reloads the page
 * and loses whatever state the screen was in. */
export const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
