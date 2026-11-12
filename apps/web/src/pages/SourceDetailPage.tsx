import type { Processor } from '@subhub/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Loader2, Pencil, RefreshCw, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { CopyButton } from '@/components/common/CopyButton';
import { PageHeader } from '@/components/common/PageHeader';
import { NodeList } from '@/components/nodes/NodeList';
import { ProcessorEditor } from '@/components/outputs/ProcessorEditor';
import { SourceFormDialog } from '@/components/sources/SourceFormDialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api } from '@/lib/api';
import { formatDate, formatFlow } from '@/lib/format';
import { cn } from '@/lib/utils';

export function SourceDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const sourceId = Number(id);
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [tab, setTab] = useState('overview');
  const [search, setSearch] = useState('');
  const [processors, setProcessors] = useState<Processor[]>([]);

  const source = useQuery({
    queryKey: ['source', sourceId],
    queryFn: () => api.getSource(sourceId),
    enabled: Number.isInteger(sourceId) && sourceId > 0,
  });
  const nodes = useQuery({
    queryKey: ['source-nodes', sourceId],
    queryFn: () => api.getSourceNodes(sourceId),
    enabled: Number.isInteger(sourceId) && sourceId > 0,
  });

  useEffect(() => {
    if (source.data) setProcessors(source.data.processors ?? []);
  }, [source.data]);

  const refresh = useMutation({
    mutationFn: () => api.refreshSource(sourceId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['source', sourceId] });
      void queryClient.invalidateQueries({ queryKey: ['source-nodes', sourceId] });
      void queryClient.invalidateQueries({ queryKey: ['sources'] });
      toast.success(t('common.refresh'));
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const saveProcessors = useMutation({
    mutationFn: () => api.updateSource(sourceId, { processors }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['source', sourceId] });
      void queryClient.invalidateQueries({ queryKey: ['source-nodes', sourceId] });
      void queryClient.invalidateQueries({ queryKey: ['sources'] });
      toast.success(t('sources.processorsSaved'));
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const filtered = useMemo(() => {
    const list = nodes.data?.nodes ?? [];
    const keyword = search.trim().toLowerCase();
    if (!keyword) return list;
    return list.filter(
      (node) =>
        node.name.toLowerCase().includes(keyword) ||
        node.server.toLowerCase().includes(keyword) ||
        node.type.toLowerCase().includes(keyword),
    );
  }, [nodes.data, search]);

  if (source.isLoading) return <Skeleton className="h-40 w-full" />;
  if (!source.data) {
    return (
      <div className="text-sm text-muted-foreground">
        <Link to="/sources" className="underline">
          {t('common.back')}
        </Link>
      </div>
    );
  }

  const data = source.data;
  const allNodes = nodes.data?.nodes ?? [];
  const warnings = nodes.data?.warnings ?? [];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-3 shrink-0">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link to="/sources">
            <ArrowLeft className="size-4" />
            {t('common.back')}
          </Link>
        </Button>
      </div>
      <PageHeader
        title={data.name}
        description={`${t('sources.nodeCount', {
          count: allNodes.length || data.nodeCount,
        })} · ${data.kind === 'remote' ? t('sources.remote') : t('sources.manual')}`}
        action={
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              aria-label={t('sources.refreshNow')}
              onClick={() => refresh.mutate()}
              disabled={refresh.isPending}
            >
              <RefreshCw className={cn('size-4', refresh.isPending && 'animate-spin')} />
              <span className="hidden sm:inline">{t('sources.refreshNow')}</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              aria-label={t('common.edit')}
              onClick={() => setEditOpen(true)}
            >
              <Pencil className="size-4" />
              <span className="hidden sm:inline">{t('common.edit')}</span>
            </Button>
          </div>
        }
      />

      <Tabs value={tab} onValueChange={setTab} className="min-h-0 flex-1">
        <TabsList className="w-full shrink-0 sm:w-fit">
          <TabsTrigger value="overview" className="flex-1 sm:flex-none sm:px-4">
            {t('sources.overview')}
          </TabsTrigger>
          <TabsTrigger value="processors" className="flex-1 sm:flex-none sm:px-4">
            {t('sources.processors')}
          </TabsTrigger>
          <TabsTrigger value="nodes" className="flex-1 sm:flex-none sm:px-4">
            {t('sources.nodes')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 min-h-0 flex-1 space-y-4 overflow-y-auto">
          <Card>
            <CardContent className="grid grid-cols-2 gap-6 sm:grid-cols-4">
              <Metric label={t('sources.nodes')} value={String(allNodes.length)} />
              <Metric label={t('sources.flow')} value={formatFlow(data.flow)} />
              <Metric label={t('sources.fetchedAt')} value={formatDate(data.fetchedAt)} />
              <Metric
                label={t('common.enabled')}
                value={data.enabled ? t('common.enabled') : t('common.disabled')}
              />
            </CardContent>
          </Card>

          {data.url ? (
            <Card>
              <CardContent className="space-y-2">
                <div className="text-xs text-muted-foreground">{t('sources.url')}</div>
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate font-mono text-xs">{data.url}</span>
                  <CopyButton value={data.url} size="icon" variant="ghost" />
                </div>
              </CardContent>
            </Card>
          ) : null}

          {data.lastError ? (
            <Card className="ring-destructive/30">
              <CardContent className="text-xs text-destructive">
                {t('sources.lastError')}: {data.lastError}
              </CardContent>
            </Card>
          ) : null}
        </TabsContent>

        <TabsContent
          value="processors"
          className="mt-4 min-h-0 flex-1 overflow-y-auto lg:overflow-hidden"
        >
          <div className="grid grid-cols-1 gap-6 lg:h-full lg:min-h-0 lg:grid-cols-5">
            <section className="flex min-w-0 flex-col lg:col-span-3 lg:min-h-0">
              <div className="shrink-0 pb-3">
                <h2 className="text-sm font-medium">{t('sources.processors')}</h2>
                <p className="mt-1 text-xs text-muted-foreground">{t('sources.processorsHint')}</p>
              </div>
              <div className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-1">
                <ProcessorEditor value={processors} onChange={setProcessors} />
              </div>
              <div className="mt-3 flex shrink-0 flex-wrap items-center justify-end gap-3 border-t pt-3">
                <p className="mr-auto max-w-md text-xs text-muted-foreground">
                  {t('sources.previewHint')}
                </p>
                <Button onClick={() => saveProcessors.mutate()} disabled={saveProcessors.isPending}>
                  {saveProcessors.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                  {t('common.save')}
                </Button>
              </div>
            </section>

            <section className="flex min-w-0 flex-col border-t pt-4 lg:col-span-2 lg:min-h-0 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6">
              <div className="flex shrink-0 items-center justify-between gap-3 pb-3">
                <div className="flex min-w-0 items-baseline gap-2">
                  <h2 className="text-sm font-medium">{t('sources.processedNodes')}</h2>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {allNodes.length}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t('sources.refreshPreview')}
                  title={t('sources.refreshPreview')}
                  onClick={() => void nodes.refetch()}
                  disabled={nodes.isFetching}
                >
                  <RefreshCw className={cn('size-3.5', nodes.isFetching && 'animate-spin')} />
                </Button>
              </div>
              {warnings.length ? (
                <div className="shrink-0 pb-3">
                  <Warnings items={warnings} />
                </div>
              ) : null}
              <div className="@container min-h-0 lg:flex-1 lg:overflow-hidden">
                {allNodes.length ? (
                  <NodeList
                    nodes={allNodes}
                    className="max-h-96 overflow-y-auto lg:h-full lg:max-h-none"
                  />
                ) : (
                  <p className="py-8 text-center text-xs text-muted-foreground">
                    {t('common.none')}
                  </p>
                )}
              </div>
              <div className="mt-3 shrink-0 border-t pt-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-between"
                  onClick={() => setTab('nodes')}
                >
                  {t('sources.viewAllNodes')}
                  <ArrowRight className="size-4" />
                </Button>
              </div>
            </section>
          </div>
        </TabsContent>

        <TabsContent value="nodes" className="mt-4 flex min-h-0 flex-1 flex-col gap-3">
          <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder={t('outputs.searchNodes')}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <span className="text-xs text-muted-foreground sm:ml-2 sm:shrink-0">
              {t('outputs.nodeResults', { count: filtered.length })}
            </span>
          </div>
          {warnings.length ? <Warnings items={warnings} /> : null}
          <Card className="@container flex min-h-0 flex-1 flex-col gap-0 overflow-hidden py-0">
            {filtered.length > 0 ? (
              <NodeList nodes={filtered} className="min-h-0 flex-1 overflow-y-auto p-3" />
            ) : (
              <p className="flex flex-1 items-center justify-center py-10 text-sm text-muted-foreground">
                {t('common.none')}
              </p>
            )}
          </Card>
        </TabsContent>
      </Tabs>

      <SourceFormDialog open={editOpen} onOpenChange={setEditOpen} source={data} />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 truncate text-sm font-medium tabular-nums">{value || '-'}</div>
    </div>
  );
}

function Warnings({ items }: { items: string[] }) {
  const { t } = useTranslation();
  return (
    <div className="border-l-2 border-destructive pl-3">
      <div className="text-xs font-medium text-destructive">{t('outputs.warnings')}</div>
      <ul className="mt-1 space-y-1 text-xs text-destructive">
        {items.map((warning) => (
          <li key={warning}>{warning}</li>
        ))}
      </ul>
    </div>
  );
}
