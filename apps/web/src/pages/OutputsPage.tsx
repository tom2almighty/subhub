import { type OutputDto, TARGET_LABELS } from '@subhub/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Layers, MoreHorizontal, Pencil, Plus, Send, Share2, Sliders } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { EmptyState } from '@/components/common/EmptyState';
import { PageHeader } from '@/components/common/PageHeader';
import { ViewSwitcher } from '@/components/common/ViewSwitcher';
import { CopySubscription } from '@/components/outputs/CopySubscription';
import { OutputFormDialog } from '@/components/outputs/OutputFormDialog';
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
import { useMediaQuery } from '@/lib/use-media-query';
import { useViewMode } from '@/lib/use-view-mode';
import { cn } from '@/lib/utils';

function OutputBadges({ output }: { output: OutputDto }) {
  const { t } = useTranslation();
  return (
    <>
      <Badge variant="secondary">{TARGET_LABELS[output.target]}</Badge>
      {!output.enabled ? (
        <Badge variant="outline" className="border-dashed text-muted-foreground">
          {t('common.disabled')}
        </Badge>
      ) : null}
    </>
  );
}

function OutputMetrics({ output, stacked }: { output: OutputDto; stacked?: boolean }) {
  const { t } = useTranslation();
  const sourceNames =
    output.sources.length > 0
      ? output.sources.map((item) => item.name).join(', ')
      : t('common.none');

  return (
    <div
      className={cn(
        'text-xs text-muted-foreground',
        stacked
          ? 'flex flex-col items-start gap-2'
          : 'flex flex-wrap items-center gap-x-4 gap-y-1.5',
      )}
    >
      <div className={cn('flex items-center gap-1.5', stacked && 'w-full min-w-0')}>
        <Layers className="size-3.5 shrink-0 text-muted-foreground" />
        <span className={cn(stacked && 'truncate')}>
          {t('outputs.sources')}:{' '}
          <strong className="font-medium text-foreground/80">{sourceNames}</strong>
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <Sliders className="size-3.5 text-muted-foreground" />
        <span>
          {t('outputs.processors')}:{' '}
          <strong className="font-medium text-foreground/80">{output.processors.length}</strong>
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <Share2 className="size-3.5 text-muted-foreground" />
        <span>
          {t('outputs.shares')}:{' '}
          <strong className="font-medium text-foreground/80">{output.shareCount}</strong>
        </span>
      </div>
    </div>
  );
}

function OutputActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex shrink-0 items-center gap-0.5">
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

export function OutputsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<OutputDto | undefined>();
  const [deleting, setDeleting] = useState<OutputDto | undefined>();
  const [view, setView] = useViewMode('subhub.outputs.view');
  const desktop = useMediaQuery('(min-width: 640px)');
  const mode = desktop ? view : 'card';

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

  function openEditor(output?: OutputDto) {
    setEditing(output);
    setFormOpen(true);
  }

  function renderActions(output: OutputDto) {
    return <OutputActions onEdit={() => openEditor(output)} onDelete={() => setDeleting(output)} />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        title={t('outputs.title')}
        description={
          outputs.data ? t('outputs.summary', { count: outputs.data.length }) : undefined
        }
        action={
          <>
            <ViewSwitcher value={view} onChange={setView} />
            <Button size="sm" onClick={() => openEditor()}>
              <Plus className="size-4" />
              <span>{t('outputs.new')}</span>
            </Button>
          </>
        }
      />

      {outputs.isLoading ? (
        <div className={mode === 'card' ? 'card-grid' : 'space-y-3'}>
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-28 w-full rounded-xl" />
        </div>
      ) : outputs.data?.length ? (
        <div
          className={cn(
            'min-h-0 flex-1 overflow-y-auto pr-0.5',
            mode === 'card' ? 'card-grid' : 'space-y-3',
          )}
        >
          {outputs.data.map((output) =>
            mode === 'card' ? (
              <Card
                key={output.id}
                className="group flex h-full flex-col p-4 transition-all hover:border-foreground/20 hover:shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <Link
                    to={`/outputs/${output.id}`}
                    className="min-w-0 flex-1 space-y-2.5 rounded-md focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-base font-medium text-foreground transition-colors group-hover:text-primary">
                        {output.name}
                      </span>
                      <OutputBadges output={output} />
                    </div>
                    <OutputMetrics output={output} stacked />
                  </Link>
                  {renderActions(output)}
                </div>

                <div className="mt-auto pt-4">
                  <CopySubscription
                    url={output.url}
                    defaultTarget={output.target}
                    variant="outline"
                    showLabel
                    className="w-full"
                  />
                </div>
              </Card>
            ) : (
              <Card
                key={output.id}
                className="group relative overflow-hidden transition-all hover:border-foreground/20 hover:shadow-sm"
              >
                <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <Link
                    to={`/outputs/${output.id}`}
                    className="min-w-0 flex-1 space-y-2.5 rounded-md focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-base font-medium text-foreground transition-colors group-hover:text-primary">
                        {output.name}
                      </span>
                      <OutputBadges output={output} />
                    </div>
                    <OutputMetrics output={output} />
                  </Link>

                  <div className="flex shrink-0 items-center justify-end gap-1.5 border-t border-border/40 pt-2 sm:border-t-0 sm:pt-0">
                    <CopySubscription
                      url={output.url}
                      defaultTarget={output.target}
                      variant="outline"
                      showLabel
                    />
                    {renderActions(output)}
                  </div>
                </div>
              </Card>
            ),
          )}
        </div>
      ) : (
        <Card className="flex min-h-75 flex-1 items-center justify-center p-8">
          <EmptyState
            icon={Send}
            title={t('outputs.empty')}
            action={
              <Button size="sm" onClick={() => openEditor()}>
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
