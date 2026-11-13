import { SOURCE_DEFAULT_TARGET, type SourceDto } from '@subhub/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  AlertCircle,
  CalendarClock,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Server,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { EmptyState } from '@/components/common/EmptyState';
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
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { formatExpire, formatFlow } from '@/lib/format';
import { useMediaQuery } from '@/lib/use-media-query';
import { useViewMode } from '@/lib/use-view-mode';
import { cn } from '@/lib/utils';

function SourceBadges({ source }: { source: SourceDto }) {
  const { t } = useTranslation();
  return (
    <>
      <Badge variant={source.kind === 'remote' ? 'secondary' : 'outline'}>
        {source.kind === 'remote' ? t('sources.remote') : t('sources.manual')}
      </Badge>
      {!source.enabled ? (
        <Badge variant="outline" className="border-dashed text-muted-foreground">
          {t('common.disabled')}
        </Badge>
      ) : null}
    </>
  );
}

function SourceMetrics({ source, stacked }: { source: SourceDto; stacked?: boolean }) {
  const { t } = useTranslation();
  return (
    <div
      className={cn(
        'text-xs text-muted-foreground',
        stacked
          ? 'flex flex-col items-start gap-2'
          : 'flex flex-wrap items-center gap-x-4 gap-y-1.5',
      )}
    >
      <div className="flex items-center gap-1.5 font-medium text-foreground/80">
        <Server className="size-3.5 text-muted-foreground" />
        <span>{t('sources.nodeCount', { count: source.nodeCount })}</span>
      </div>
      {source.flow ? (
        <div className="flex items-center gap-1.5">
          <Activity className="size-3.5 text-muted-foreground" />
          <span>
            {t('sources.flow')}: {formatFlow(source.flow)}
          </span>
        </div>
      ) : null}
      <div className="flex items-center gap-1.5">
        <CalendarClock className="size-3.5 text-muted-foreground" />
        <span>
          {t('sources.expiresAt')}: {source.flow?.expire ? formatExpire(source.flow.expire) : '∞'}
        </span>
      </div>
    </div>
  );
}

function SourceError({ source }: { source: SourceDto }) {
  if (!source.lastError) return null;
  return (
    <div className="flex items-start gap-1.5 rounded-md bg-destructive/10 p-2 text-xs text-destructive">
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
  const [view, setView] = useViewMode('subhub.sources.view');
  const desktop = useMediaQuery('(min-width: 640px)');
  const mode = desktop ? view : 'card';

  const sources = useQuery({ queryKey: ['sources'], queryFn: api.listSources });
  const totalNodes = sources.data?.reduce((sum, source) => sum + source.nodeCount, 0) ?? 0;

  const refresh = useMutation({
    mutationFn: api.refreshSource,
    onSuccess: (source) => {
      void queryClient.invalidateQueries({ queryKey: ['sources'] });
      void queryClient.invalidateQueries({ queryKey: ['source', source.id] });
      toast.success(t('common.refresh'));
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
            <ViewSwitcher value={view} onChange={setView} />
            <Button size="sm" onClick={() => openEditor()}>
              <Plus className="size-4" />
              <span>{t('sources.new')}</span>
            </Button>
          </>
        }
      />

      {sources.isLoading ? (
        <div className={mode === 'card' ? 'card-grid' : 'space-y-3'}>
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-28 w-full rounded-xl" />
        </div>
      ) : sources.data?.length ? (
        <div
          className={cn(
            'min-h-0 flex-1 overflow-y-auto pr-0.5',
            mode === 'card' ? 'card-grid' : 'space-y-3',
          )}
        >
          {sources.data.map((source) =>
            mode === 'card' ? (
              <Card
                key={source.id}
                className="group flex h-full flex-col p-4 transition-all hover:border-foreground/20 hover:shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <Link
                    to={`/sources/${source.id}`}
                    className="min-w-0 flex-1 space-y-2.5 rounded-md focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-base font-medium text-foreground transition-colors group-hover:text-primary">
                        {source.name}
                      </span>
                      <SourceBadges source={source} />
                    </div>
                    <SourceMetrics source={source} stacked />
                  </Link>
                  {renderActions(source)}
                </div>

                {source.lastError ? (
                  <div className="mt-3">
                    <SourceError source={source} />
                  </div>
                ) : null}

                <div className="mt-auto pt-4">
                  <CopySubscription
                    url={source.directUrl}
                    defaultTarget={SOURCE_DEFAULT_TARGET}
                    variant="outline"
                    showLabel
                    className="w-full"
                  />
                </div>
              </Card>
            ) : (
              <Card
                key={source.id}
                className="group relative overflow-hidden transition-all hover:border-foreground/20 hover:shadow-sm"
              >
                <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <Link
                    to={`/sources/${source.id}`}
                    className="min-w-0 flex-1 space-y-2.5 rounded-md focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-base font-medium text-foreground transition-colors group-hover:text-primary">
                        {source.name}
                      </span>
                      <SourceBadges source={source} />
                    </div>
                    <SourceMetrics source={source} />
                    <SourceError source={source} />
                  </Link>

                  <div className="flex shrink-0 items-center justify-end gap-1.5 border-t border-border/40 pt-2 sm:border-t-0 sm:pt-0">
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

      <SourceFormDialog open={formOpen} onOpenChange={setFormOpen} source={editing} />
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
