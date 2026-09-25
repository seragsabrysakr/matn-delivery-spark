import { useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  Activity,
  Building2,
  ChevronsLeft,
  ChevronsRight,
  CircleUserRound,
  Cpu,
  Gauge,
  LayoutGrid,
  LogOut,
  Menu,
  Moon,
  RefreshCw,
  Settings,
  Sparkles,
  Sun,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useI18n, type TKey } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";
import { isDevPreview, useWorkspace, type PreviewState } from "@/data/workspace";
import { Iso, statusDot } from "./primitives";
import type { DataFreshness, WorkspaceFilters } from "@/data/types";

const navItems = [
  { to: "/", key: "nav.overview", icon: LayoutGrid },
  { to: "/delivery", key: "nav.delivery", icon: Gauge },
  { to: "/team", key: "nav.team", icon: Users },
  { to: "/engineering", key: "nav.engineering", icon: Cpu },
  { to: "/intelligence", key: "nav.intelligence", icon: Sparkles },
  { to: "/settings/azure", key: "nav.settings", icon: Settings },
] as const;

function BrandMark({ compact }: { compact?: boolean }) {
  const { t } = useI18n();
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span className="grid size-9 shrink-0 place-items-center rounded-md bg-navy text-navy-foreground">
        <Activity className="size-4.5" aria-hidden />
      </span>
      {!compact && (
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold leading-tight text-sidebar-foreground">
            {t("brand.name")}
          </span>
          <span className="block truncate text-[11px] leading-tight text-muted-foreground">
            {t("brand.tagline")}
          </span>
        </span>
      )}
    </div>
  );
}

function NavList({ compact, onNavigate }: { compact?: boolean; onNavigate?: () => void }) {
  const { t, locale } = useI18n();
  const tipSide = locale === "ar" ? "left" : "right";
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className="flex flex-col gap-1 px-2" aria-label={t("shell.menu")}>
      {navItems.map((item) => {
        const active = pathname === item.to;
        const Icon = item.icon;
        const link = (
          <Link
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            aria-label={compact ? t(item.key as TKey) : undefined}
            className={cn(
              "flex min-h-11 items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors motion-reduce:transition-none",
              compact && "justify-center px-2",
              active
                ? "bg-navy text-navy-foreground"
                : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground",
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden />
            {!compact && <span className="truncate">{t(item.key as TKey)}</span>}
          </Link>
        );
        if (!compact) return link;
        return (
          <Tooltip key={item.to}>
            <TooltipTrigger asChild>{link}</TooltipTrigger>
            <TooltipContent side={tipSide}>{t(item.key as TKey)}</TooltipContent>
          </Tooltip>
        );
      })}
    </nav>
  );
}

function FilterSelect({
  labelKey,
  filterKey,
  items,
  compact,
}: {
  labelKey: TKey;
  filterKey: keyof WorkspaceFilters;
  items: { id: string; name: { ar: string; en: string } }[];
  compact?: boolean;
}) {
  const { t, locale } = useI18n();
  const { filters, setFilter } = useWorkspace();
  return (
    <label className="block min-w-0">
      {!compact && (
        <span className="mb-0.5 block text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {t(labelKey)}
        </span>
      )}
      <Select value={filters[filterKey]} onValueChange={(v) => setFilter(filterKey, v)}>
        <SelectTrigger className="h-8 w-full bg-card text-[13px]" aria-label={t(labelKey)}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((i) => (
            <SelectItem key={i.id} value={i.id}>
              {i.name[locale]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </label>
  );
}

function ScopeFilters({ compact }: { compact?: boolean }) {
  const { options } = useWorkspace();
  return (
    <div className={cn("grid gap-1.5", compact ? "grid-cols-2" : "grid-cols-1")}>
      <FilterSelect
        labelKey="shell.organization"
        filterKey="organizationId"
        items={options.organizations}
      />
      <FilterSelect labelKey="shell.project" filterKey="projectId" items={options.projects} />
      <FilterSelect labelKey="shell.team" filterKey="teamId" items={options.teams} />
      <FilterSelect labelKey="shell.sprint" filterKey="iterationId" items={options.iterations} />
    </div>
  );
}

function useScopeLabels() {
  const { locale } = useI18n();
  const { filters, options } = useWorkspace();
  const pick = (list: { id: string; name: { ar: string; en: string } }[], id: string) =>
    list.find((x) => x.id === id)?.name[locale] ?? "—";
  return {
    organization: pick(options.organizations, filters.organizationId),
    project: pick(options.projects, filters.projectId),
    team: pick(options.teams, filters.teamId),
    sprint: pick(options.iterations, filters.iterationId),
  };
}

/** Collapsed-sidebar workspace context: icon trigger plus a descriptive tooltip. */
function CollapsedScope({ onExpand }: { onExpand: () => void }) {
  const { t, locale } = useI18n();
  const tipSide = locale === "ar" ? "left" : "right";
  const scope = useScopeLabels();
  const label = `${t("shell.project")}: ${scope.project} · ${t("shell.sprint")}: ${scope.sprint}`;
  return (
    <div className="border-b border-sidebar-border px-2 py-2">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="min-h-11 w-full"
            aria-label={`${t("brand.workspace")} — ${label}`}
            onClick={onExpand}
          >
            <Building2 className="size-4" aria-hidden />
          </Button>
        </TooltipTrigger>
        <TooltipContent side={tipSide} className="max-w-56 text-xs">
          <span className="block font-medium">{t("brand.workspace")}</span>
          <span className="block">
            {t("shell.organization")}: {scope.organization}
          </span>
          <span className="block">
            {t("shell.project")}: {scope.project}
          </span>
          <span className="block">
            {t("shell.team")}: {scope.team}
          </span>
          <span className="block">
            {t("shell.sprint")}: {scope.sprint}
          </span>
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

/** Development-only interface state preview. Never rendered in production. */
function StatePreviewSelect() {
  const { t } = useI18n();
  const { previewState, setPreviewState } = useWorkspace();
  if (!isDevPreview) return null;
  const states: PreviewState[] = ["normal", "loading", "empty", "error", "stale", "partial"];
  return (
    <Select value={previewState} onValueChange={(v) => setPreviewState(v as PreviewState)}>
      <SelectTrigger
        className="h-8 w-[130px] border-dashed bg-card text-xs"
        aria-label={`${t("dev.state")} — ${t("dev.only")}`}
        title={t("dev.only")}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {states.map((st) => (
          <SelectItem key={st} value={st} className="text-xs">
            {t(`dev.state.${st}` as TKey)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function freshnessKey(f: DataFreshness): TKey {
  return `shell.freshness.${f}` as TKey;
}

function TopBar({ onOpenMobileNav }: { onOpenMobileNav: () => void }) {
  const { t, locale, setLocale } = useI18n();
  const { theme, toggleTheme } = useTheme();
  const { snapshot, loading, refresh, mode, dataState } = useWorkspace();
  const freshness = snapshot?.freshness ?? "fresh";
  const dotClass =
    mode === "real"
      ? dataState === "current"
        ? statusDot.healthy
        : dataState === "failed"
          ? statusDot.critical
          : statusDot.atRisk
      : freshness === "fresh"
        ? statusDot.healthy
        : freshness === "error"
          ? statusDot.critical
          : statusDot.atRisk;

  // In real mode the header reports the work-item data state, never a
  // Foundation-sync freshness value.
  const label = mode === "real" ? t(`real.state.${dataState}` as TKey) : t(freshnessKey(freshness));
  const showLastSync =
    mode === "real" ? dataState === "current" || dataState === "stale" : Boolean(snapshot);

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur">
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5 sm:px-6">
        <div className="flex items-center gap-2 lg:hidden">
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("shell.menu")}
            onClick={onOpenMobileNav}
          >
            <Menu className="size-5" aria-hidden />
          </Button>
        </div>
        <div className="hidden lg:block" />

        <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
          <span className={cn("size-2 shrink-0 rounded-full", dotClass)} aria-hidden />
          <span className="truncate">
            {label}
            {showLastSync && snapshot
              ? ` · ${t("shell.lastSync")} ${t("common.minutes", { a: snapshot.lastSyncMinutesAgo })}`
              : ""}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <div className="hidden sm:block">
            <StatePreviewSelect />
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t("shell.refresh")}
            title={t("shell.refresh")}
            onClick={refresh}
          >
            <RefreshCw className={cn("size-4", loading && "animate-spin")} aria-hidden />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="px-2 font-semibold"
            aria-label={t("shell.language")}
            onClick={() => setLocale(locale === "ar" ? "en" : "ar")}
          >
            {locale === "ar" ? "EN" : "ع"}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={theme === "dark" ? t("shell.theme.light") : t("shell.theme.dark")}
            onClick={toggleTheme}
          >
            {theme === "dark" ? (
              <Sun className="size-4" aria-hidden />
            ) : (
              <Moon className="size-4" aria-hidden />
            )}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={t("shell.profile")}>
                <CircleUserRound className="size-5" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel className="font-normal">
                <span className="block text-sm font-medium">Omar Nasser</span>
                <span className="block text-xs text-muted-foreground">Delivery Manager</span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem>
                <CircleUserRound className="size-4" aria-hidden />
                {t("shell.profile")}
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Settings className="size-4" aria-hidden />
                {t("shell.settings")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem>
                <LogOut className="size-4" aria-hidden />
                {t("shell.signout")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { t, locale } = useI18n();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="flex min-h-screen">
        <aside
          className={cn(
            "sticky top-0 hidden h-screen shrink-0 flex-col border-e border-sidebar-border bg-sidebar lg:flex",
            collapsed ? "w-[76px]" : "w-[264px]",
          )}
        >
          <div className="flex h-[57px] items-center justify-between gap-2 border-b border-sidebar-border px-4">
            <BrandMark compact={collapsed} />
          </div>

          {collapsed ? (
            <CollapsedScope onExpand={() => setCollapsed(false)} />
          ) : (
            <div className="border-b border-sidebar-border px-3 py-2.5">
              <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {t("brand.workspace")}
              </p>
              <ScopeFilters />
            </div>
          )}

          <div className="flex-1 overflow-y-auto py-3">
            <NavList compact={collapsed} />
          </div>

          <div className="border-t border-sidebar-border p-2">
            <Button
              variant="ghost"
              size="sm"
              className={cn("w-full justify-start gap-2", collapsed && "justify-center")}
              onClick={() => setCollapsed((c) => !c)}
              aria-label={collapsed ? t("shell.expand") : t("shell.collapse")}
            >
              {collapsed ? (
                <ChevronsRight className="size-4 rtl:rotate-180" aria-hidden />
              ) : (
                <ChevronsLeft className="size-4 rtl:rotate-180" aria-hidden />
              )}
              {!collapsed && <span className="truncate text-xs">{t("shell.collapse")}</span>}
            </Button>
          </div>
        </aside>

        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent
            side={locale === "ar" ? "right" : "left"}
            className="w-[280px] bg-sidebar p-0"
          >
            <SheetTitle className="sr-only">{t("shell.menu")}</SheetTitle>
            <div className="flex h-[57px] items-center border-b border-sidebar-border px-4">
              <BrandMark />
            </div>
            <div className="border-b border-sidebar-border px-4 py-3">
              <ScopeFilters />
            </div>
            <div className="py-3">
              <NavList onNavigate={() => setMobileOpen(false)} />
            </div>
            <div className="px-4 pb-4 sm:hidden">
              <StatePreviewSelect />
            </div>
          </SheetContent>
        </Sheet>

        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar onOpenMobileNav={() => setMobileOpen(true)} />
          <main className="min-w-0 flex-1 px-4 py-5 sm:px-6 sm:py-6">{children}</main>
        </div>
      </div>
    </div>
  );
}

export { Sheet, SheetTrigger };
