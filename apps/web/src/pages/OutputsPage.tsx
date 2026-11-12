import { type OutputDto, TARGET_LABELS } from '@subhub/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MoreHorizontal, Plus, Send } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
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
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { api } from '@/lib/api';

export function OutputsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<OutputDto | undefined>();
  const [deleting, setDeleting] = useState<OutputDto | undefined>();

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
          <Button
            size="sm"
            onClick={() => {
              setEditing(undefined);
              setFormOpen(true);
            }}
          >
            <Plus className="size-4" />
            <span className="hidden sm:inline">{t('outputs.new')}</span>
          </Button>
        }
      />

      {outputs.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-20 w-full rounded-xl" />
        </div>
      ) : outputs.data?.length ? (
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
          {outputs.data.map((output) => (
            <Card
              key={output.id}
              className="flex flex-row items-start gap-2 px-4 py-3 transition-colors hover:bg-muted/30"
            >
              <Link to={`/outputs/${output.id}`} className="flex min-w-0 flex-1 items-start">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium">{output.name}</span>
                    <Badge variant="secondary">{TARGET_LABELS[output.target]}</Badge>
                    {!output.enabled ? (
                      <Badge variant="outline" className="text-muted-foreground">
                        {t('common.disabled')}
                      </Badge>
                    ) : null}
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span>
                      {t('outputs.sources')}:{' '}
                      {output.sources.length > 0
                        ? output.sources.map((item) => item.name).join(', ')
                        : t('common.none')}
                    </span>
                    <span>
                      {t('outputs.processors')}: {output.processors.length}
                    </span>
                    <span>
                      {t('outputs.shares')}: {output.shareCount}
                    </span>
                  </div>
                </div>
              </Link>
              <CopySubscription url={output.url} defaultTarget={output.target} />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" aria-label={t('common.actions')}>
                    <MoreHorizontal className="size-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    onClick={() => {
                      setEditing(output);
                      setFormOpen(true);
                    }}
                  >
                    {t('common.edit')}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={() => setDeleting(output)}
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
