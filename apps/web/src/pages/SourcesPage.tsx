import { SOURCE_DEFAULT_TARGET, type SourceDto } from '@subhub/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  Clock,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Server,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { EmptyState } from '@/components/common/EmptyState';
import { FlowBar } from '@/components/common/FlowBar';
import { PageHeader } from '@/components/common/PageHeader';
import { ViewSwitcher } from '@/components/common/ViewSwitcher';
import { CopySubscription } from '@/components/outputs/CopySubscription';
import { SourceFormDialog } from '@/components/sources/SourceFormDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { api } from '@/lib/api';
import { formatDate, formatRelativeTime } from '@/lib/format';
import { useMediaQuery } from '@/lib/use-media-query';
import { useViewMode } from '@/lib/use-view-mode';
import { cn } from '@/lib/utils';

type SourceFilter = 'all' | 'enabled' | 'error';

function SourceBadges({ source }: { source: SourceDto }) {
  const { t } = useTranslation();
  return (
    <>
      <Badge variant={source.kind === 'remote' ? 'secondary' : 'outline'} className="text-[11px]">
        {source.kind === 'remote' ? t('sources.remote') : t('sources.manual')}
      </Badge>
      {source.lastError ? (
        <Badge variant="destructive" className="text-[11px]">
          {t('sources.errorStatus')}
        </Badge>
      ) : null}
    </>
  );
}

function SourceError({ source }: { source: SourceDto }) {
  if (!source.lastError) return null;
  return (
    <div className="flex items-start gap-1.5 rounded-lg border border-destructive/20 bg-destructive/10 p-2.5 text-xs text-destructive">
      <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
      <span className="line-clamp-2 leading-relaxed">{source.lastError}</span>
    </div>
  );
}

function SourceActions({
  refreshing,
  onRefresh,
  onEdit,
  onDelete,
}: {
  refreshing: boolean;
  onRefresh: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={onRefresh}
        disabled={refreshing}
        title={t('sources.refreshNow')}
        aria-label={t('sources.refreshNow')}
      >
        <RefreshCw className={cn('size-3.5', refreshing && 'animate-spin')} />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        title={t('common.edit')}
        aria-label={t('common.edit')}
        onClick={onEdit}
      >
        <Pencil className="size-3.5" />
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={t('common.actions')}>
            <MoreHorizontal className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={onDelete}>
            {t('common.delete')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function SourcesPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SourceDto | undefined>();
  const [deleting, setDeleting] = useState<SourceDto | undefined>();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<SourceFilter>('all');
  const [view, setView] = useViewMode('subhub.sources.view');
  const desktop = useMediaQuery('(min-width: 640px)');
  const mode = desktop ? view : 'card';

  const sources = useQuery({ queryKey: ['sources'], queryFn: api.listSources });
  const navigate = useNavigate();
  const totalNodes = sources.data?.reduce((sum, source) => sum + source.nodeCount, 0) ?? 0;
  const hasRemote = (sources.data ?? []).some(
    (source) => source.kind === 'remote' && source.enabled,
  );

  const filteredSources = useMemo(() => {
    const list = sources.data ?? [];
    const q = search.trim().toLowerCase();
    return list.filter((source) => {
      if (filter === 'enabled' && !source.enabled) return false;
      if (filter === 'error' && !source.lastError) return false;
      if (q && !source.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [sources.data, search, filter]);

  const refresh = useMutation({
    mutationFn: api.refreshSource,
    onSuccess: (source) => {
      void queryClient.invalidateQueries({ queryKey: ['sources'] });
      void queryClient.invalidateQueries({ queryKey: ['source', source.id] });
      toast.success(t('common.refresh'));
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const refreshAll = useMutation({
    mutationFn: api.refreshAllSources,
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['sources'] });
      if (result.failed.length > 0) {
        toast.warning(
          t('sources.refreshAllPartial', {
            refreshed: result.refreshed,
            total: result.total,
            failed: result.failed.length,
          }),
        );
      } else {
        toast.success(
          t('sources.refreshAllResult', {
            refreshed: result.refreshed,
            total: result.total,
          }),
        );
      }
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const toggleEnabled = useMutation({
    mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) =>
      api.updateSource(id, { enabled }),
    onSuccess: (source) => {
      void queryClient.invalidateQueries({ queryKey: ['sources'] });
      void queryClient.invalidateQueries({ queryKey: ['source', source.id] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: api.deleteSource,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['sources'] });
      setDeleting(undefined);
      toast.success(t('common.delete'));
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function openEditor(source?: SourceDto) {
    setEditing(source);
    setFormOpen(true);
  }

  function renderActions(source: SourceDto) {
    return (
      <SourceActions
        refreshing={refresh.isPending && refresh.variables === source.id}
        onRefresh={() => refresh.mutate(source.id)}
        onEdit={() => openEditor(source)}
        onDelete={() => setDeleting(source)}
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        title={t('sources.title')}
        description={
          sources.data
            ? `${t('sources.summary', { count: sources.data.length })} · ${t('sources.nodeCount', {
                count: totalNodes,
              })}`
            : undefined
        }
        action={
          <>
            {hasRemote ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => refreshAll.mutate()}
                disabled={refreshAll.isPending}
                title={t('sources.refreshAll')}
              >
                <RefreshCw className={cn('size-3.5', refreshAll.isPending && 'animate-spin')} />
                <span className="hidden sm:inline">{t('sources.refreshAll')}</span>
              </Button>
            ) : null}
            <ViewSwitcher value={view} onChange={setView} />
            <Button size="sm" onClick={() => openEditor()}>
              <Plus className="size-4" />
              <span>{t('sources.new')}</span>
            </Button>
          </>
        }
      />

      {sources.data?.length ? (
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative max-w-xs flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('sources.searchPlaceholder')}
              className="h-9 pl-8 text-sm"
            />
          </div>
          <div className="flex items-center gap-1.5">
            {(['all', 'enabled', 'error'] as const).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                  filter === key
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
              >
                {t(`sources.filter_${key}`)}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {sources.isLoading ? (
        <div className={mode === 'card' ? 'card-grid' : 'space-y-3'}>
          <Skeleton className="h-36 w-full rounded-xl" />
          <Skeleton className="h-36 w-full rounded-xl" />
          <Skeleton className="h-36 w-full rounded-xl" />
        </div>
      ) : sources.data?.length ? (
        filteredSources.length ? (
          <div
            className={cn(
              'min-h-0 flex-1 overflow-y-auto pr-0.5',
              mode === 'card' ? 'card-grid' : 'space-y-3',
            )}
          >
            {filteredSources.map((source) =>
              mode === 'card' ? (
                <Card
                  key={source.id}
                  className={cn(
                    'group flex h-full flex-col p-4 transition-all hover:border-primary/30 hover:shadow-sm',
                    !source.enabled && 'opacity-65',
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <Link
                      to={`/sources/${source.id}`}
                      className="min-w-0 flex-1 space-y-2 rounded-md focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="truncate text-base font-semibold text-foreground transition-colors group-hover:text-primary">
                          {source.name}
                        </span>
                        <SourceBadges source={source} />
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1 font-medium text-foreground/85 tabular-nums">
                          <Server className="size-3.5 text-muted-foreground" />
                          {t('sources.nodeCount', { count: source.nodeCount })}
                        </span>
                        {source.fetchedAt ? (
                          <span
                            className="inline-flex items-center gap-1 tabular-nums"
                            title={formatDate(source.fetchedAt)}
                          >
                            <Clock className="size-3 text-muted-foreground" />
                            {formatRelativeTime(source.fetchedAt)}
                          </span>
                        ) : null}
                      </div>
                    </Link>
                    {renderActions(source)}
                  </div>

                  <div className="mt-3">
                    <FlowBar flow={source.flow} compact />
                  </div>

                  {source.lastError ? (
                    <div className="mt-3">
                      <SourceError source={source} />
                    </div>
                  ) : null}

                  <div className="mt-auto flex items-center justify-between gap-2 pt-4">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={source.enabled}
                        onCheckedChange={(checked) =>
                          toggleEnabled.mutate({ id: source.id, enabled: checked })
                        }
                        aria-label={t('sources.enabled')}
                      />
                      <span className="text-xs text-muted-foreground">
                        {source.enabled ? t('common.enabled') : t('common.disabled')}
                      </span>
                    </div>
                    <CopySubscription
                      url={source.directUrl}
                      defaultTarget={SOURCE_DEFAULT_TARGET}
                      variant="outline"
                      showLabel
                    />
                  </div>
                </Card>
              ) : (
                <Card
                  key={source.id}
                  className={cn(
                    'group relative overflow-hidden transition-all hover:border-primary/30 hover:shadow-sm',
                    !source.enabled && 'opacity-65',
                  )}
                >
                  <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <Link
                      to={`/sources/${source.id}`}
                      className="min-w-0 flex-1 space-y-2 rounded-md focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-base font-semibold text-foreground transition-colors group-hover:text-primary">
                          {source.name}
                        </span>
                        <SourceBadges source={source} />
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1 font-medium text-foreground/85 tabular-nums">
                          <Server className="size-3.5 text-muted-foreground" />
                          {t('sources.nodeCount', { count: source.nodeCount })}
                        </span>
                        {source.fetchedAt ? (
                          <span
                            className="inline-flex items-center gap-1 tabular-nums"
                            title={formatDate(source.fetchedAt)}
                          >
                            <Clock className="size-3 text-muted-foreground" />
                            {formatRelativeTime(source.fetchedAt)}
                          </span>
                        ) : null}
                      </div>
                      <FlowBar flow={source.flow} compact className="max-w-md" />
                      <SourceError source={source} />
                    </Link>

                    <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border/40 pt-2 sm:border-t-0 sm:pt-0">
                      <Switch
                        checked={source.enabled}
                        onCheckedChange={(checked) =>
                          toggleEnabled.mutate({ id: source.id, enabled: checked })
                        }
                        aria-label={t('sources.enabled')}
                      />
                      <CopySubscription
                        url={source.directUrl}
                        defaultTarget={SOURCE_DEFAULT_TARGET}
                        variant="outline"
                        showLabel
                      />
                      {renderActions(source)}
                    </div>
                  </div>
                </Card>
              ),
            )}
          </div>
        ) : (
          <Card className="flex min-h-48 items-center justify-center p-8">
            <p className="text-sm text-muted-foreground">{t('command.empty')}</p>
          </Card>
        )
      ) : (
        <Card className="flex min-h-75 flex-1 items-center justify-center p-8">
          <EmptyState
            icon={Server}
            title={t('sources.empty')}
            action={
              <Button size="sm" onClick={() => openEditor()}>
                <Plus className="size-4" />
                {t('sources.new')}
              </Button>
            }
          />
        </Card>
      )}

      <SourceFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        source={editing}
        onSaved={(saved) => {
          if (!editing && saved.kind === 'manual') {
            navigate(`/sources/${saved.id}?tab=nodes`);
          }
        }}
      />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(undefined)}
        title={t('common.delete')}
        description={t('sources.deleteConfirm')}
        onConfirm={() => {
          if (deleting) remove.mutate(deleting.id);
        }}
      />
    </div>
  );
}
