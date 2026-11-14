import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Languages,
  Laptop,
  LogOut,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Send,
  Server,
  Settings,
  Share2,
  Sun,
  UserRound,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { CommandPalette } from '@/components/layout/CommandPalette';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

const NAV = [
  { to: '/sources', key: 'nav.sources', icon: Server, countKey: 'sources' },
  { to: '/outputs', key: 'nav.outputs', icon: Send, countKey: 'outputs' },
  { to: '/shares', key: 'nav.shares', icon: Share2, countKey: 'shares' },
  { to: '/settings', key: 'nav.settings', icon: Settings, countKey: null },
] as const;

const LANGUAGES = [
  { value: 'zh-CN', label: '中文' },
  { value: 'en-US', label: 'English' },
] as const;

const SIDEBAR_STORAGE_KEY = 'subhub.sidebar.collapsed';

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function MobileBottomNav() {
  const { t } = useTranslation();

  return (
    <div className="fixed bottom-3 inset-x-0 z-40 flex justify-center px-4 sm:hidden pointer-events-none">
      <nav className="pointer-events-auto flex w-full max-w-md items-center gap-1 rounded-full border border-border/80 bg-background/90 p-1.5 shadow-xl backdrop-blur-xl ring-1 ring-black/5 select-none dark:ring-white/10">
        {NAV.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'flex flex-1 flex-col items-center justify-center gap-1 rounded-full px-3 py-2 text-xs font-medium leading-none transition-all duration-200 active:scale-95',
                  isActive
                    ? 'bg-primary text-primary-foreground shadow-xs font-semibold'
                    : 'text-muted-foreground hover:text-foreground',
                )
              }
            >
              <Icon className="size-5 shrink-0" />
              <span className="truncate">{t(item.key)}</span>
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
}

export function AppLayout() {
  const { t, i18n } = useTranslation();
  const { theme, setTheme } = useTheme();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [cmdOpen, setCmdOpen] = useState(false);

  const sources = useQuery({ queryKey: ['sources'], queryFn: api.listSources });
  const outputs = useQuery({ queryKey: ['outputs'], queryFn: api.listOutputs });
  const shares = useQuery({ queryKey: ['shares'], queryFn: api.listShares });

  const counts = {
    sources: sources.data?.length,
    outputs: outputs.data?.length,
    shares: shares.data?.length,
  };

  const currentTheme = theme === 'light' || theme === 'dark' ? theme : 'system';
  const ThemeIcon = currentTheme === 'dark' ? Moon : currentTheme === 'light' ? Sun : Laptop;
  const themeLabelKey =
    currentTheme === 'dark'
      ? 'settings.dark'
      : currentTheme === 'light'
        ? 'settings.light'
        : 'settings.system';
  const language = i18n.resolvedLanguage === 'en-US' ? 'en-US' : 'zh-CN';

  const logout = useMutation({
    mutationFn: api.logout,
    onSuccess: () => {
      queryClient.setQueryData(['me'], null);
      queryClient.clear();
      navigate('/login', { replace: true });
    },
  });

  function cycleTheme() {
    const order = ['light', 'dark', 'system'] as const;
    const index = order.indexOf(currentTheme);
    setTheme(order[(index + 1) % order.length] ?? 'system');
  }

  function toggleSidebar() {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, next ? '1' : '0');
    } catch {
      // ignore storage failure
    }
  }

  return (
    <div className="flex h-svh overflow-hidden bg-background">
      {/* Desktop collapsible sidebar */}
      <aside
        className={cn(
          'hidden shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200 sm:flex',
          collapsed ? 'w-16' : 'w-56',
        )}
      >
        <div
          className={cn(
            'flex h-14 shrink-0 items-center border-b border-sidebar-border px-3',
            collapsed ? 'justify-center' : 'justify-between',
          )}
        >
          {!collapsed ? (
            <Link
              to="/sources"
              className="flex min-w-0 items-center gap-2.5 transition-opacity hover:opacity-90"
            >
              <img src="/favicon.svg" alt="" className="size-7 shrink-0 rounded-md shadow-xs" />
              <span className="truncate text-base font-semibold tracking-tight text-sidebar-foreground">
                {t('app.name')}
              </span>
            </Link>
          ) : null}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={toggleSidebar}
            aria-label={collapsed ? t('common.expand') : t('common.collapse')}
            title={collapsed ? t('common.expand') : t('common.collapse')}
            className="text-muted-foreground hover:text-foreground"
          >
            {collapsed ? (
              <PanelLeftOpen className="size-4" />
            ) : (
              <PanelLeftClose className="size-4" />
            )}
          </Button>
        </div>

        <div className="px-2.5 pt-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setCmdOpen(true)}
            className={cn(
              'h-8 w-full border-border/80 bg-background/70 text-muted-foreground hover:text-foreground',
              collapsed ? 'justify-center px-0' : 'justify-between px-2.5',
            )}
            title={`${t('command.placeholder')} (⌘K)`}
          >
            <span className="flex items-center gap-2">
              <Search className="size-3.5 shrink-0" />
              {!collapsed ? <span className="text-xs">{t('common.search')}</span> : null}
            </span>
            {!collapsed ? (
              <kbd className="rounded border border-border bg-muted px-1 py-0.2 font-mono text-[10px] text-muted-foreground">
                ⌘K
              </kbd>
            ) : null}
          </Button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-2.5 py-3">
          {NAV.map((item) => {
            const Icon = item.icon;
            const count = item.countKey ? counts[item.countKey] : undefined;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                title={collapsed ? t(item.key) : undefined}
                className={({ isActive }) =>
                  cn(
                    'flex items-center rounded-lg px-2.5 py-2 text-sm font-medium transition-colors',
                    collapsed ? 'justify-center' : 'justify-between gap-2',
                    isActive
                      ? 'bg-sidebar-primary text-sidebar-primary-foreground shadow-xs'
                      : 'text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <span className="flex min-w-0 items-center gap-2.5">
                      <Icon className="size-4 shrink-0" />
                      {!collapsed ? <span className="truncate">{t(item.key)}</span> : null}
                    </span>
                    {!collapsed && count !== undefined ? (
                      <span
                        className={cn(
                          'rounded-full px-1.5 py-0.2 font-mono text-[11px] tabular-nums',
                          isActive
                            ? 'bg-sidebar-primary-foreground/20 text-sidebar-primary-foreground font-semibold'
                            : 'text-muted-foreground',
                        )}
                      >
                        {count}
                      </span>
                    ) : null}
                  </>
                )}
              </NavLink>
            );
          })}
        </nav>

        <div className="shrink-0 border-t border-sidebar-border p-2.5">
          {collapsed ? (
            <div className="flex flex-col items-center gap-1">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={cycleTheme}
                aria-label={`${t('settings.theme')}: ${t(themeLabelKey)}`}
                title={`${t('settings.theme')}: ${t(themeLabelKey)}`}
              >
                <ThemeIcon className="size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => logout.mutate()}
                disabled={logout.isPending}
                aria-label={t('auth.logout')}
                title={t('auth.logout')}
                className="text-muted-foreground hover:text-destructive"
              >
                <LogOut className="size-4" />
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-1">
              <div className="flex items-center gap-0.5">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={cycleTheme}
                  aria-label={`${t('settings.theme')}: ${t(themeLabelKey)}`}
                  title={`${t('settings.theme')}: ${t(themeLabelKey)}`}
                >
                  <ThemeIcon className="size-4" />
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t('settings.language')}
                      title={t('settings.language')}
                    >
                      <Languages className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="min-w-36">
                    <DropdownMenuRadioGroup
                      value={language}
                      onValueChange={(value) => void i18n.changeLanguage(value)}
                    >
                      {LANGUAGES.map((item) => (
                        <DropdownMenuRadioItem key={item.value} value={item.value}>
                          {item.label}
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => logout.mutate()}
                disabled={logout.isPending}
                className="h-8 gap-1.5 px-2 text-xs text-muted-foreground hover:text-destructive"
              >
                <LogOut className="size-3.5" />
                <span>{t('auth.logout')}</span>
              </Button>
            </div>
          )}
        </div>
      </aside>

      {/* Main content area */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Mobile header */}
        <header className="sticky top-0 z-30 flex h-13 shrink-0 items-center justify-between border-b border-border bg-background/85 px-4 backdrop-blur-md sm:hidden">
          <Link
            to="/sources"
            className="flex shrink-0 items-center gap-2 transition-opacity hover:opacity-90"
          >
            <img src="/favicon.svg" alt="" className="size-6 rounded-md shadow-xs" />
            <span className="text-base font-semibold tracking-tight text-foreground">
              {t('app.name')}
            </span>
          </Link>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setCmdOpen(true)}
              aria-label={t('common.search')}
            >
              <Search className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={cycleTheme}
              aria-label={`${t('settings.theme')}: ${t(themeLabelKey)}`}
            >
              <ThemeIcon className="size-4" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label={t('settings.language')}>
                  <Languages className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-36">
                <DropdownMenuRadioGroup
                  value={language}
                  onValueChange={(value) => void i18n.changeLanguage(value)}
                >
                  {LANGUAGES.map((item) => (
                    <DropdownMenuRadioItem key={item.value} value={item.value}>
                      {item.label}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label={t('settings.account')}>
                  <UserRound className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => logout.mutate()} disabled={logout.isPending}>
                  <LogOut className="size-4 text-destructive" />
                  <span className="text-destructive">{t('auth.logout')}</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col px-4 pt-4 pb-24 sm:px-6 sm:py-6 sm:pb-8 lg:px-8">
            <Outlet />
          </div>
        </main>

        <MobileBottomNav />
      </div>

      <CommandPalette open={cmdOpen} onOpenChange={setCmdOpen} />
    </div>
  );
}
