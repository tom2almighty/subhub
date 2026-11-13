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
import { ColumnSwitcher } from '@/components/common/ColumnSwitcher';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { EmptyState } from '@/components/common/EmptyState';
import { PageHeader } from '@/components/common/PageHeader';
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
import { columnGridClass, useColumnCount } from '@/lib/use-columns';
import { cn } from '@/lib/utils';

export function SourcesPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SourceDto | undefined>();
  const [deleting, setDeleting] = useState<SourceDto | undefined>();
  const [columns, setColumns] = useColumnCount('subhub.sources.columns');

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
            <ColumnSwitcher value={columns} onChange={setColumns} />
            <Button
              size="sm"
              onClick={() => {
                setEditing(undefined);
                setFormOpen(true);
              }}
            >
              <Plus className="size-4" />
              <span>{t('sources.new')}</span>
            </Button>
          </>
        }
      />

      {sources.isLoading ? (
        <div className={cn('grid gap-3', columnGridClass(columns))}>
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-28 w-full rounded-xl" />
        </div>
      ) : sources.data?.length ? (
        <div
          className={cn(
            'grid min-h-0 flex-1 content-start gap-3 overflow-y-auto pr-0.5',
            columnGridClass(columns),
          )}
        >
          {sources.data.map((source) => {
            const isRefreshing = refresh.isPending && refresh.variables === source.id;

            return (
              <Card
                key={source.id}
                className="group relative overflow-hidden transition-all hover:border-foreground/20 hover:shadow-sm"
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 gap-3">
                  <Link
                    to={`/sources/${source.id}`}
                    className="flex-1 min-w-0 space-y-2.5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-md"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-base font-medium text-foreground group-hover:text-primary transition-colors">
                        {source.name}
                      </span>
                      <Badge variant={source.kind === 'remote' ? 'secondary' : 'outline'}>
                        {source.kind === 'remote' ? t('sources.remote') : t('sources.manual')}
                      </Badge>
                      {!source.enabled ? (
                        <Badge variant="outline" className="text-muted-foreground border-dashed">
                          {t('common.disabled')}
                        </Badge>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
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
                          {t('sources.expiresAt')}:{' '}
                          {source.flow?.expire ? formatExpire(source.flow.expire) : '∞'}
                        </span>
                      </div>
                    </div>

                    {source.lastError ? (
                      <div className="mt-2 flex items-start gap-1.5 rounded-md bg-destructive/10 p-2 text-xs text-destructive">
                        <AlertCircle className="size-3.5 shrink-0 mt-0.5" />
                        <span className="line-clamp-2 leading-relaxed">{source.lastError}</span>
                      </div>
                    ) : null}
                  </Link>

                  <div className="flex items-center justify-end gap-1.5 shrink-0 pt-2 sm:pt-0 border-t border-border/40 sm:border-t-0">
                    <CopySubscription
                      url={source.directUrl}
                      defaultTarget={SOURCE_DEFAULT_TARGET}
                      variant="outline"
                      showLabel
                    />

                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => refresh.mutate(source.id)}
                      disabled={isRefreshing}
                      title={t('sources.refreshNow')}
                      aria-label={t('sources.refreshNow')}
                    >
                      <RefreshCw className={cn('size-3.5', isRefreshing && 'animate-spin')} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      title={t('common.edit')}
                      aria-label={t('common.edit')}
                      onClick={() => {
                        setEditing(source);
                        setFormOpen(true);
                      }}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label={t('common.actions')}>
                          <MoreHorizontal className="size-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => setDeleting(source)}
                        >
                          {t('common.delete')}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className="flex min-h-75 flex-1 items-center justify-center p-8">
          <EmptyState
            icon={Server}
            title={t('sources.empty')}
            action={
              <Button
                size="sm"
                onClick={() => {
                  setEditing(undefined);
                  setFormOpen(true);
                }}
              >
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
