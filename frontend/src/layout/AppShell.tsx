import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import type { StaffMe } from "../api/auth";
import { getAttentionCount } from "../api/conversations";
import { GlobalSearchBar } from "../components/GlobalSearchBar";
import { ErrorBoundary } from "../components/ErrorBoundary";
import {
  ChevronDownIcon,
  LogoutIcon,
  MenuIcon,
  MoonIcon,
  SidebarIcon,
  SunIcon,
  UserIcon,
} from "../icons";
import { isSelfScopedRole, pathForKey, roleLabel, visibleSections } from "../nav";
import { CountBadge, cn } from "../ui";
import type { Theme } from "../theme";

const COLLAPSE_KEY = "pluto_nav_collapsed";

/** Arabic doesn't shape into a two-letter monogram the way Latin initials do,
 * and "د." is a title, not a name -- one letter of the actual name reads best. */
function initial(fullName: string) {
  return fullName.replace(/^د\.\s*/, "").trim()[0] ?? "؟";
}

export function AppShell({
  staff,
  theme,
  onToggleTheme,
  onLogout,
}: {
  staff: StaffMe;
  theme: Theme;
  onToggleTheme: () => void;
  onLogout: () => void;
}) {
  const sections = visibleSections(staff.role, staff.permissions);
  const selfScoped = isSelfScopedRole(staff.role);
  const location = useLocation();
  const navigate = useNavigate();

  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === "1");

  // Route changes close the mobile drawer: on a phone the nav covers the
  // screen, so leaving it open would hide the page it just navigated to.
  useEffect(() => setMobileOpen(false), [location.pathname]);

  // A long nav scrolls, and the active row can land under the account block
  // at the bottom -- so it is brought into view whenever the route changes.
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => {
    navRef.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: "nearest" });
  }, [location.pathname]);

  const toggleCollapsed = () => {
    setCollapsed((v) => {
      localStorage.setItem(COLLAPSE_KEY, v ? "0" : "1");
      return !v;
    });
  };

  // Search only federates entities that already have their own page --
  // gating it the same way keeps it from being a way to probe permissions
  // you don't hold (the backend enforces this too, this just avoids showing
  // an empty box to someone who could never get a result from it).
  const canSearch =
    staff.permissions.includes("patient.view") ||
    staff.permissions.includes("appointment.view") ||
    staff.permissions.includes("staff.view");
  const canSeeInbox = sections.some((s) => s.items.some((i) => i.key === "inbox"));

  const [attentionCount, setAttentionCount] = useState(0);
  useEffect(() => {
    if (!canSeeInbox) return;
    const poll = () => getAttentionCount().then(setAttentionCount).catch(() => {});
    poll();
    const interval = setInterval(poll, 60000);
    return () => clearInterval(interval);
  }, [canSeeInbox]);

  const goToKey = (key: string) => navigate(pathForKey(key, staff.role));

  return (
    <div data-ui className="min-h-svh bg-bg font-sans text-fg">
      {/* Scrim for the off-canvas nav; inert on desktop where the rail is
          always visible. */}
      <div
        onClick={() => setMobileOpen(false)}
        className={cn(
          "fixed inset-0 z-30 bg-overlay transition-opacity lg:hidden",
          mobileOpen ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        aria-hidden="true"
      />

      <aside
        className={cn(
          "fixed inset-y-0 start-0 z-40 flex flex-col bg-surface shadow-[var(--hairline)] transition-[width,transform] duration-250",
          collapsed ? "lg:w-[78px]" : "lg:w-[268px]",
          "w-[286px]",
          mobileOpen ? "translate-x-0" : "translate-x-full lg:translate-x-0",
        )}
      >
        <div className={cn("flex items-center gap-3 px-4 py-5", collapsed && "lg:justify-center lg:px-2")}>
          <span
            className="grid size-10 shrink-0 place-items-center rounded-[13px] bg-[image:var(--accent-gradient)] font-display text-lg font-bold text-white shadow-[var(--accent-glow)]"
            aria-hidden="true"
          >
            ع
          </span>
          <span className={cn("min-w-0 flex-1", collapsed && "lg:hidden")}>
            <span className="block truncate font-display text-[15px] font-bold tracking-tight text-heading">
              لوحة العيادة
            </span>
            <span className="block truncate text-[11.5px] text-muted">{roleLabel[staff.role] ?? staff.role}</span>
          </span>
          <button
            type="button"
            onClick={toggleCollapsed}
            title={collapsed ? "توسيع القائمة" : "طي القائمة"}
            aria-label={collapsed ? "توسيع القائمة" : "طي القائمة"}
            className={cn(
              "hidden size-8 cursor-pointer appearance-none place-items-center rounded-lg border-0 bg-transparent p-0 text-muted transition hover:bg-hover hover:text-heading lg:grid",
              collapsed && "lg:hidden",
            )}
          >
            <SidebarIcon className="size-[18px]" />
          </button>
        </div>

        <nav
          ref={navRef}
          className="flex-1 overflow-y-auto px-3 pb-3 [mask-image:linear-gradient(to_bottom,black_calc(100%-28px),transparent)]"
          aria-label="القائمة الرئيسية"
        >
          {sections.map((section, i) => (
            <div key={section.label ?? `s${i}`} className="mb-1">
              {section.label && (
                <div
                  className={cn(
                    "px-3 pt-5 pb-2 text-[10.5px] font-bold tracking-[0.12em] text-faint uppercase",
                    collapsed && "lg:hidden",
                  )}
                >
                  {section.label}
                </div>
              )}
              {collapsed && section.label && (
                <hr className="mx-2 my-2 hidden border-line lg:block" />
              )}
              <ul className="flex list-none flex-col gap-0.5 p-0">
                {section.items.map((item) => (
                  <li key={item.key}>
                    <NavLink
                      to={item.path}
                      title={item.label}
                      className={({ isActive }) =>
                        cn(
                          "group relative flex items-center gap-3 rounded-[12px] px-3 py-2.5 font-sans text-[13.5px] font-semibold no-underline",
                          "transition duration-150",
                          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
                          isActive
                            ? "bg-brand-bg text-brand shadow-[var(--hairline)]"
                            : "text-fg hover:bg-hover hover:text-heading",
                          collapsed && "lg:justify-center lg:px-0",
                        )
                      }
                    >
                      {({ isActive }) => (
                        <>
                          <span
                            aria-hidden="true"
                            className={cn(
                              "absolute inset-y-2 start-0 w-[3px] rounded-e-full bg-[image:var(--accent-gradient)] transition-all duration-200",
                              isActive ? "opacity-100" : "opacity-0 group-hover:opacity-40",
                            )}
                          />
                          <item.Icon className="size-[19px] shrink-0" />
                          <span className={cn("min-w-0 flex-1 truncate", collapsed && "lg:hidden")}>
                            {item.label}
                          </span>
                          {item.key === "inbox" && (
                            <span className={cn(collapsed && "lg:hidden")}>
                              <CountBadge count={attentionCount} tone="danger" />
                            </span>
                          )}
                        </>
                      )}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <AccountMenu
          staff={staff}
          theme={theme}
          collapsed={collapsed}
          onToggleTheme={onToggleTheme}
          onLogout={onLogout}
          onExpand={() => setCollapsed(false)}
        />
      </aside>

      <div className={cn("flex min-h-svh flex-col transition-[padding] duration-200", collapsed ? "lg:ps-[76px]" : "lg:ps-[264px]")}>
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-0 border-b border-line bg-[var(--surface-translucent)] px-4 backdrop-blur-xl sm:px-6">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="القائمة"
            className="grid size-10 shrink-0 cursor-pointer appearance-none place-items-center rounded-xl border border-line bg-transparent p-0 text-fg transition hover:bg-hover lg:hidden"
          >
            <MenuIcon />
          </button>
          {canSearch && (
            <GlobalSearchBar onNavigate={goToKey} isSelfScoped={selfScoped} />
          )}
          <div className="ms-auto flex items-center gap-2">
            <button
              type="button"
              onClick={onToggleTheme}
              title={theme === "dark" ? "الوضع الفاتح" : "الوضع الداكن"}
              aria-label={theme === "dark" ? "الوضع الفاتح" : "الوضع الداكن"}
              className="grid size-10 cursor-pointer appearance-none place-items-center rounded-xl border border-line bg-transparent p-0 text-fg transition hover:border-brand-border hover:bg-brand-bg hover:text-brand"
            >
              {theme === "dark" ? <SunIcon /> : <MoonIcon />}
            </button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1460px] flex-1 px-4 py-6 sm:px-7 sm:py-7">
          {/* Keyed by path so navigating away from a crashed screen clears it. */}
          <ErrorBoundary key={location.pathname}>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}

function AccountMenu({
  staff,
  theme,
  collapsed,
  onToggleTheme,
  onLogout,
  onExpand,
}: {
  staff: StaffMe;
  theme: Theme;
  collapsed: boolean;
  onToggleTheme: () => void;
  onLogout: () => void;
  onExpand: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const item =
    "flex w-full cursor-pointer appearance-none items-center gap-2.5 rounded-lg border-0 bg-transparent px-3 py-2 font-sans text-[13.5px] font-semibold text-fg transition hover:bg-hover hover:text-heading";

  return (
    <div ref={ref} className="relative m-3 mt-0 rounded-[15px] bg-surface-2/60 p-1.5 shadow-[var(--hairline)]">
      {open && (
        <div className="absolute inset-x-3 bottom-[calc(100%-0.25rem)] z-10 animate-pop-in rounded-xl border border-line bg-surface p-1.5 shadow-[var(--shadow-md)]">
          <NavLink to="/account" onClick={() => setOpen(false)} className={cn(item, "no-underline")}>
            <UserIcon className="size-[18px]" />
            حسابي
          </NavLink>
          <button type="button" className={item} onClick={onToggleTheme}>
            {theme === "dark" ? <SunIcon className="size-[18px]" /> : <MoonIcon className="size-[18px]" />}
            {theme === "dark" ? "الوضع الفاتح" : "الوضع الداكن"}
          </button>
          <hr className="my-1 border-line" />
          <button type="button" className={cn(item, "text-danger hover:bg-danger-bg hover:text-danger")} onClick={onLogout}>
            <LogoutIcon className="size-[18px]" />
            تسجيل الخروج
          </button>
        </div>
      )}
      <button
        type="button"
        onClick={() => {
          // A collapsed rail has nowhere to anchor the menu, so the first
          // click reopens the rail and the second opens the menu.
          if (collapsed) {
            onExpand();
            return;
          }
          setOpen((v) => !v);
        }}
        aria-expanded={open}
        className={cn(
          "flex w-full cursor-pointer appearance-none items-center gap-3 rounded-[13px] border-0 bg-transparent p-2 text-start font-sans transition hover:bg-surface-2",
          open && "bg-surface-2 shadow-[var(--hairline)]",
        )}
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[image:var(--accent-gradient)] font-display text-sm font-bold text-white">
          {initial(staff.full_name)}
        </span>
        <span className={cn("min-w-0 flex-1", collapsed && "lg:hidden")}>
          <span className="block truncate text-[13px] font-bold text-heading">{staff.full_name}</span>
          <span className="block truncate text-[11.5px] text-muted">
            {roleLabel[staff.role] ?? staff.role}
          </span>
        </span>
        <ChevronDownIcon
          className={cn("size-4 shrink-0 text-faint transition", open && "rotate-180", collapsed && "lg:hidden")}
        />
      </button>
    </div>
  );
}
