import type { SourceDto } from '@subhub/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MoreHorizontal, Plus, RefreshCw, Server } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { EmptyState } from '@/components/common/EmptyState';
import { PageHeader } from '@/components/common/PageHeader';
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
import { formatDate, formatFlow } from '@/lib/format';

export function SourcesPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SourceDto | undefined>();
  const [deleting, setDeleting] = useState<SourceDto | undefined>();

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
          <Button
            size="sm"
            onClick={() => {
              setEditing(undefined);
              setFormOpen(true);
            }}
          >
            <Plus className="size-4" />
            <span className="hidden sm:inline">{t('sources.new')}</span>
          </Button>
        }
      />

      {sources.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-20 w-full rounded-xl" />
        </div>
      ) : sources.data?.length ? (
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
          {sources.data.map((source) => (
            <Card
              key={source.id}
              className="flex flex-row items-start gap-2 px-4 py-3 transition-colors hover:bg-muted/30"
            >
              <Link to={`/sources/${source.id}`} className="flex min-w-0 flex-1 items-start">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium">{source.name}</span>
                    <Badge variant={source.kind === 'remote' ? 'secondary' : 'outline'}>
                      {source.kind === 'remote' ? t('sources.remote') : t('sources.manual')}
                    </Badge>
                    {!source.enabled ? (
                      <Badge variant="outline" className="text-muted-foreground">
                        {t('common.disabled')}
                      </Badge>
                    ) : null}
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>{t('sources.nodeCount', { count: source.nodeCount })}</span>
                    <span>
                      {t('sources.flow')}: {formatFlow(source.flow)}
                    </span>
                    <span>
                      {t('sources.fetchedAt')}: {formatDate(source.fetchedAt)}
                    </span>
                  </div>
                  {source.lastError ? (
                    <p className="mt-2 line-clamp-2 text-xs text-destructive">{source.lastError}</p>
                  ) : null}
                </div>
              </Link>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" aria-label={t('common.actions')}>
                    <MoreHorizontal className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => refresh.mutate(source.id)}>
                    <RefreshCw className="size-4" />
                    {t('sources.refreshNow')}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      setEditing(source);
                      setFormOpen(true);
                    }}
                  >
                    {t('common.edit')}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={() => setDeleting(source)}
                  >
                    {t('common.delete')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="flex min-h-0 flex-1 items-center justify-center py-0">
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
