import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";

/** Keeps one screen's crash from taking the dashboard with it.
 *
 * There was no boundary anywhere, so a single unexpected shape — a report
 * without its breakdown, a list that came back as something else — unmounted
 * the whole tree and left a blank page with no sidebar and no way back. A
 * receptionist hitting that mid-shift has no route forward except reloading
 * and hoping. Caught here, the rest of the dashboard keeps working and the
 * broken screen says so.
 *
 * Keyed by the active tab: React only resets a boundary when it remounts, so
 * without a changing key the error state would survive navigating away.
 */
export class ErrorBoundary extends Component<
  { children: ReactNode; onReset?: () => void },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Nothing ships these anywhere yet; the console is what a developer has
    // when a user reports "the screen went white".
    console.error("screen crashed:", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="page">
        <div className="page-header">
          <div>
            <div className="page-header-title">تعذّر عرض هذه الشاشة</div>
            <div className="page-header-subtitle">
              صار خطأ غير متوقع بهاي الصفحة. باقي اللوحة شغالة — بتقدر تنتقل لأي قسم تاني من القائمة.
            </div>
          </div>
        </div>
        <div className="crash-actions">
          <button className="btn-primary" onClick={() => this.setState({ error: null })}>
            حاول مرة تانية
          </button>
          <button className="btn-secondary" onClick={() => window.location.reload()}>
            إعادة تحميل
          </button>
        </div>
        <details className="crash-details">
          <summary>تفاصيل تقنية</summary>
          <code>{this.state.error.message}</code>
        </details>
      </div>
    );
  }
}
