import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Languages,
  Laptop,
  LogOut,
  Moon,
  Send,
  Server,
  Settings,
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
  { to: '/settings', key: 'nav.settings', icon: Settings },
] as const;

const LANGUAGES = [
  { value: 'zh-CN', label: '中文' },
  { value: 'en-US', label: 'English' },
] as const;

function NavLinks({ mobile = false }: { mobile?: boolean }) {
  const { t } = useTranslation();

  return (
    <nav className={cn('items-center gap-1', mobile ? 'flex' : 'hidden sm:flex')}>
      {NAV.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-2 rounded-md text-sm font-medium transition-colors',
                mobile ? 'flex-1 justify-center px-3 py-2' : 'px-3 py-1.5',
                isActive
                  ? 'bg-muted text-foreground'
                  : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
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
    <div className="flex h-svh flex-col overflow-hidden">
      <header className="z-30 shrink-0 border-b border-border/60 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-3 px-4 sm:px-6 lg:px-8">
          <Link to="/sources" className="flex shrink-0 items-center gap-2">
            <img src="/favicon.svg" alt="" className="size-7 rounded-md" />
            <span className="text-sm font-semibold tracking-tight">{t('app.name')}</span>
          </Link>

          <div className="ml-2 hidden sm:block">
            <NavLinks />
          </div>

          <div className="ml-auto flex items-center gap-1">
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
                  <LogOut className="size-4" />
                  {t('auth.logout')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <div className="border-t px-3 py-1.5 sm:hidden">
          <NavLinks mobile />
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-hidden">
        <div className="mx-auto flex h-full w-full max-w-6xl flex-col px-4 py-6 sm:px-6 md:py-8 lg:px-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
