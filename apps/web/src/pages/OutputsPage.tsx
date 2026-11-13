import { type OutputDto, TARGET_LABELS } from '@subhub/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Layers, MoreHorizontal, Plus, Send, Share2, Sliders } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { ColumnSwitcher } from '@/components/common/ColumnSwitcher';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { EmptyState } from '@/components/common/EmptyState';
import { PageHeader } from '@/components/common/PageHeader';
import { CopySubscription } from '@/components/outputs/CopySubscription';
import { OutputFormDialog } from '@/components/outputs/OutputFormDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';
import { columnGridClass, useColumnCount } from '@/lib/use-columns';
import { cn } from '@/lib/utils';

export function OutputsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<OutputDto | undefined>();
  const [deleting, setDeleting] = useState<OutputDto | undefined>();
  const [columns, setColumns] = useColumnCount('subhub.outputs.columns');

  const outputs = useQuery({ queryKey: ['outputs'], queryFn: api.listOutputs });
  const sources = useQuery({ queryKey: ['sources'], queryFn: api.listSources });

  const remove = useMutation({
    mutationFn: api.deleteOutput,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['outputs'] });
      setDeleting(undefined);
      toast.success(t('common.delete'));
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        title={t('outputs.title')}
        description={
          outputs.data ? t('outputs.summary', { count: outputs.data.length }) : undefined
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
              <span>{t('outputs.new')}</span>
            </Button>
          </>
        }
      />

      {outputs.isLoading ? (
        <div className={cn('grid gap-3', columnGridClass(columns))}>
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-28 w-full rounded-xl" />
        </div>
      ) : outputs.data?.length ? (
        <div
          className={cn(
            'grid min-h-0 flex-1 content-start gap-3 overflow-y-auto pr-0.5',
            columnGridClass(columns),
          )}
        >
          {outputs.data.map((output) => (
            <Card
              key={output.id}
              className="group relative overflow-hidden transition-all hover:border-foreground/20 hover:shadow-sm"
            >
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 gap-3">
                <Link
                  to={`/outputs/${output.id}`}
                  className="flex-1 min-w-0 space-y-2.5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-md"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-base font-medium text-foreground group-hover:text-primary transition-colors">
                      {output.name}
                    </span>
                    <Badge variant="secondary">{TARGET_LABELS[output.target]}</Badge>
                    {!output.enabled ? (
                      <Badge variant="outline" className="text-muted-foreground border-dashed">
                        {t('common.disabled')}
                      </Badge>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <Layers className="size-3.5 text-muted-foreground" />
                      <span>
                        {t('outputs.sources')}:{' '}
                        <strong className="font-medium text-foreground/80">
                          {output.sources.length > 0
                            ? output.sources.map((item) => item.name).join(', ')
                            : t('common.none')}
                        </strong>
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Sliders className="size-3.5 text-muted-foreground" />
                      <span>
                        {t('outputs.processors')}:{' '}
                        <strong className="font-medium text-foreground/80">
                          {output.processors.length}
                        </strong>
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Share2 className="size-3.5 text-muted-foreground" />
                      <span>
                        {t('outputs.shares')}:{' '}
                        <strong className="font-medium text-foreground/80">
                          {output.shareCount}
                        </strong>
                      </span>
                    </div>
                  </div>
                </Link>

                <div className="flex items-center justify-end gap-1.5 shrink-0 pt-2 sm:pt-0 border-t border-border/40 sm:border-t-0">
                  <CopySubscription
                    url={output.url}
                    defaultTarget={output.target}
                    variant="outline"
                    showLabel
                  />
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-sm" aria-label={t('common.actions')}>
                        <MoreHorizontal className="size-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-36">
                      <DropdownMenuItem
                        onClick={() => {
                          setEditing(output);
                          setFormOpen(true);
                        }}
                      >
                        {t('common.edit')}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => setDeleting(output)}
                      >
                        {t('common.delete')}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="flex min-h-75 flex-1 items-center justify-center p-8">
          <EmptyState
            icon={Send}
            title={t('outputs.empty')}
            action={
              <Button
                size="sm"
                onClick={() => {
                  setEditing(undefined);
                  setFormOpen(true);
                }}
              >
                <Plus className="size-4" />
                {t('outputs.new')}
              </Button>
            }
          />
        </Card>
      )}

      <OutputFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        output={editing}
        sources={sources.data ?? []}
      />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(undefined)}
        title={t('common.delete')}
        description={t('outputs.deleteConfirm')}
        onConfirm={() => {
          if (deleting) remove.mutate(deleting.id);
        }}
      />
    </div>
  );
}
