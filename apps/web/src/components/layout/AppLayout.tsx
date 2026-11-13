import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Languages,
  Laptop,
  LogOut,
  Moon,
  Send,
  Server,
  Settings,
  Share2,
  Sun,
  UserRound,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { useTranslation } from 'react-i18next';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
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
  { to: '/sources', key: 'nav.sources', icon: Server },
  { to: '/outputs', key: 'nav.outputs', icon: Send },
  { to: '/shares', key: 'nav.shares', icon: Share2 },
  { to: '/settings', key: 'nav.settings', icon: Settings },
] as const;

const LANGUAGES = [
  { value: 'zh-CN', label: '中文' },
  { value: 'en-US', label: 'English' },
] as const;

function DesktopNav() {
  const { t } = useTranslation();

  return (
    <nav className="hidden items-center gap-1 sm:flex">
      {NAV.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-secondary text-foreground shadow-xs'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground',
              )
            }
          >
            <Icon className="size-4" />
            {t(item.key)}
          </NavLink>
        );
      })}
    </nav>
  );
}

function MobileBottomNav() {
  const { t } = useTranslation();

  return (
    <div className="fixed bottom-3 inset-x-0 z-40 flex justify-center px-3 sm:hidden pointer-events-none">
      <nav className="pointer-events-auto flex items-center gap-1 rounded-full border border-border/80 bg-background/90 p-1.5 shadow-xl backdrop-blur-xl ring-1 ring-black/5 select-none dark:ring-white/10">
        {NAV.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center justify-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-medium leading-none transition-all duration-200 active:scale-95',
                  isActive
                    ? 'bg-foreground text-background shadow-xs font-semibold'
                    : 'text-muted-foreground hover:text-foreground',
                )
              }
            >
              <Icon className="size-5 shrink-0" />
              <span>{t(item.key)}</span>
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

  return (
    <div className="flex h-svh flex-col overflow-hidden bg-background">
      <header className="sticky top-0 z-30 shrink-0 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-6">
            <Link
              to="/sources"
              className="flex shrink-0 items-center gap-2.5 transition-opacity hover:opacity-90"
            >
              <img src="/favicon.svg" alt="" className="size-7 rounded-md shadow-xs" />
              <span className="text-base font-semibold tracking-tight text-foreground">
                {t('app.name')}
              </span>
            </Link>
            <DesktopNav />
          </div>

          <div className="flex items-center gap-1">
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
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t('settings.account')}
                  title={t('settings.account')}
                >
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
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col px-4 pt-4 pb-24 sm:px-6 sm:py-6 sm:pb-8 lg:px-8">
          <Outlet />
        </div>
      </main>

      <MobileBottomNav />
    </div>
  );
}
