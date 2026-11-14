import { TARGET_LABELS } from '@subhub/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  RefreshCw,
  Search,
  Send,
  Server,
  Settings,
  Share2,
  SunMoon,
} from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

interface CommandItem {
  id: string;
  group: string;
  label: string;
  hint?: string;
  badge?: string;
  icon: typeof Server;
  onSelect: () => void;
}

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { resolvedTheme, setTheme } = useTheme();
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  const sources = useQuery({ queryKey: ['sources'], queryFn: api.listSources, enabled: open });
  const outputs = useQuery({ queryKey: ['outputs'], queryFn: api.listOutputs, enabled: open });

  const refreshAll = useMutation({
    mutationFn: api.refreshAllSources,
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['sources'] });
      toast.success(
        t('sources.refreshAllResult', {
          refreshed: result.refreshed,
          total: result.total,
        }),
      );
    },
    onError: (error: Error) => toast.error(error.message),
  });

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        onOpenChange(!open);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
    }
  }, [open]);

  const items = useMemo<CommandItem[]>(() => {
    const go = (path: string) => {
      onOpenChange(false);
      navigate(path);
    };

    const list: CommandItem[] = [
      {
        id: 'nav-sources',
        group: t('command.navigation'),
        label: t('nav.sources'),
        icon: Server,
        onSelect: () => go('/sources'),
      },
      {
        id: 'nav-outputs',
        group: t('command.navigation'),
        label: t('nav.outputs'),
        icon: Send,
        onSelect: () => go('/outputs'),
      },
      {
        id: 'nav-shares',
        group: t('command.navigation'),
        label: t('nav.shares'),
        icon: Share2,
        onSelect: () => go('/shares'),
      },
      {
        id: 'nav-settings',
        group: t('command.navigation'),
        label: t('nav.settings'),
        icon: Settings,
        onSelect: () => go('/settings'),
      },
      {
        id: 'action-refresh-all',
        group: t('command.actions'),
        label: t('sources.refreshAll'),
        icon: RefreshCw,
        onSelect: () => {
          onOpenChange(false);
          refreshAll.mutate();
        },
      },
      {
        id: 'action-theme',
        group: t('command.actions'),
        label: t('command.toggleTheme'),
        icon: SunMoon,
        onSelect: () => {
          setTheme(resolvedTheme === 'dark' ? 'light' : 'dark');
          onOpenChange(false);
        },
      },
    ];

    for (const source of sources.data ?? []) {
      list.push({
        id: `source-${source.id}`,
        group: t('nav.sources'),
        label: source.name,
        hint: t('sources.nodeCount', { count: source.nodeCount }),
        badge: source.kind === 'remote' ? t('sources.remote') : t('sources.manual'),
        icon: Server,
        onSelect: () => go(`/sources/${source.id}`),
      });
    }

    for (const output of outputs.data ?? []) {
      list.push({
        id: `output-${output.id}`,
        group: t('nav.outputs'),
        label: output.name,
        hint: TARGET_LABELS[output.target],
        badge: `${output.sources.length} ${t('nav.sources')}`,
        icon: Send,
        onSelect: () => go(`/outputs/${output.id}`),
      });
    }

    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.group.toLowerCase().includes(q) ||
        item.hint?.toLowerCase().includes(q),
    );
  }, [
    t,
    navigate,
    onOpenChange,
    sources.data,
    outputs.data,
    query,
    refreshAll,
    resolvedTheme,
    setTheme,
  ]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  function handleKeyDown(event: React.KeyboardEvent) {
    if (items.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((prev) => (prev + 1) % items.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((prev) => (prev - 1 + items.length) % items.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      items[activeIndex]?.onSelect();
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden p-0 sm:max-w-lg" showCloseButton={false}>
        <DialogTitle className="sr-only">{t('command.placeholder')}</DialogTitle>
        <div className="flex items-center border-b border-border px-3">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('command.placeholder')}
            autoFocus
            className="h-11 border-0 bg-transparent px-3 text-sm shadow-none focus-visible:ring-0"
          />
          <kbd className="hidden rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline-block">
            ESC
          </kbd>
        </div>

        <div className="max-h-80 overflow-y-auto p-2">
          {items.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground">
              {t('command.empty')}
            </div>
          ) : (
            <div className="space-y-0.5">
              {items.map((item, index) => {
                const Icon = item.icon;
                const active = index === activeIndex;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={item.onSelect}
                    className={cn(
                      'flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors',
                      active
                        ? 'bg-accent text-accent-foreground'
                        : 'text-foreground hover:bg-accent/60',
                    )}
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <Icon className="size-4 shrink-0 text-muted-foreground" />
                      <span className="truncate font-medium">{item.label}</span>
                      {item.hint ? (
                        <span className="truncate text-xs text-muted-foreground">{item.hint}</span>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {item.badge ? (
                        <Badge variant="secondary" className="text-[10px] font-normal">
                          {item.badge}
                        </Badge>
                      ) : null}
                      <ArrowRight
                        className={cn(
                          'size-3.5 text-muted-foreground transition-opacity',
                          active ? 'opacity-100' : 'opacity-0',
                        )}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
