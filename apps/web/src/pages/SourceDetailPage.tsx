import { type Processor, SOURCE_DEFAULT_TARGET } from '@subhub/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Globe,
  Link2,
  Loader2,
  Pencil,
  RefreshCw,
  Search,
  Send,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { CopyButton } from '@/components/common/CopyButton';
import { PageHeader } from '@/components/common/PageHeader';
import { NodeList } from '@/components/nodes/NodeList';
import { CopySubscription } from '@/components/outputs/CopySubscription';
import { ProcessorEditor } from '@/components/outputs/ProcessorEditor';
import { SourceFormDialog } from '@/components/sources/SourceFormDialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api } from '@/lib/api';
import { formatExpire, formatFlow } from '@/lib/format';
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

  if (source.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (!source.data) {
    return (
      <div className="py-12 text-center">
        <Link to="/sources" className="text-sm font-medium underline underline-offset-4">
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
      <div className="mb-2 shrink-0">
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="-ml-2 text-muted-foreground hover:text-foreground"
        >
          <Link to="/sources">
            <ArrowLeft className="size-4 mr-1" />
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
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refresh.mutate()}
              disabled={refresh.isPending}
            >
              <RefreshCw className={cn('size-3.5 mr-1', refresh.isPending && 'animate-spin')} />
              <span>{t('sources.refreshNow')}</span>
            </Button>
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              <Pencil className="size-3.5 mr-1" />
              <span>{t('common.edit')}</span>
            </Button>
          </div>
        }
      />

      <Tabs value={tab} onValueChange={setTab} className="min-h-0 flex-1 flex flex-col">
        <TabsList className="w-full shrink-0 grid grid-cols-3 sm:w-fit sm:inline-flex">
          <TabsTrigger value="overview" className="text-xs sm:text-sm px-2 sm:px-4">
            {t('sources.overview')}
          </TabsTrigger>
          <TabsTrigger value="processors" className="text-xs sm:text-sm px-2 sm:px-4">
            {t('sources.processors')}
          </TabsTrigger>
          <TabsTrigger value="nodes" className="text-xs sm:text-sm px-2 sm:px-4">
            {t('sources.nodes')}
          </TabsTrigger>
        </TabsList>

        <TabsContent
          value="overview"
          className="mt-4 min-h-0 flex-1 space-y-4 overflow-y-auto outline-none"
        >
          {/* 单源直链订阅卡片 */}
          <Card className="border-border">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Send className="size-4" />
                    <span>{t('sources.directSubscription')}</span>
                  </CardTitle>
                  <CardDescription className="mt-1">
                    {t('sources.directSubscriptionHint')}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-2 rounded-md border bg-muted/30 px-3 py-2">
                  <Link2 className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">
                    {window.location.origin}
                    {data.directUrl}
                  </span>
                </div>
                <CopySubscription
                  url={data.directUrl}
                  defaultTarget={SOURCE_DEFAULT_TARGET}
                  showLabel
                  variant="default"
                  className="w-full sm:w-auto"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="grid grid-cols-2 gap-4 p-4 sm:grid-cols-4 sm:gap-6 sm:p-6">
              <Metric
                label={t('sources.nodes')}
                value={String(allNodes.length || data.nodeCount)}
              />
              <Metric label={t('sources.flow')} value={formatFlow(data.flow)} />
              <Metric label={t('sources.expiresAt')} value={formatExpire(data.flow?.expire)} />
              <Metric
                label={t('common.enabled')}
                value={data.enabled ? t('common.enabled') : t('common.disabled')}
              />
            </CardContent>
          </Card>

          {data.url ? (
            <Card>
              <CardContent className="p-4 sm:p-6 space-y-2">
                <div className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <Globe className="size-3.5" />
                  <span>{t('sources.url')}</span>
                </div>
                <div className="flex items-center gap-2 rounded-md border bg-muted/30 p-2 sm:p-2.5">
                  <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">
                    {data.url}
                  </span>
                  <CopyButton value={data.url} size="sm" variant="ghost" />
                </div>
              </CardContent>
            </Card>
          ) : null}

          {data.lastError ? (
            <Card className="border-destructive/30 bg-destructive/5">
              <CardContent className="p-4 flex items-start gap-2.5 text-xs text-destructive">
                <AlertCircle className="size-4 shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold">{t('sources.lastError')}</div>
                  <div className="mt-1 leading-relaxed">{data.lastError}</div>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </TabsContent>

        <TabsContent
          value="processors"
          className="mt-4 min-h-0 flex-1 overflow-y-auto outline-none"
        >
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            <section className="flex min-w-0 flex-col lg:col-span-5">
              <div className="shrink-0 pb-3">
                <h2 className="text-sm font-semibold">{t('sources.processors')}</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {t('sources.processorsHint')}
                </p>
              </div>
              <div className="pr-1">
                <ProcessorEditor value={processors} onChange={setProcessors} />
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                <p className="max-w-md text-xs text-muted-foreground">{t('sources.previewHint')}</p>
                <Button onClick={() => saveProcessors.mutate()} disabled={saveProcessors.isPending}>
                  {saveProcessors.isPending ? (
                    <Loader2 className="size-3.5 animate-spin mr-1" />
                  ) : null}
                  {t('common.save')}
                </Button>
              </div>
            </section>

            <section className="flex min-w-0 flex-col border-t pt-4 lg:col-span-7 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6">
              <div className="flex shrink-0 items-center justify-between gap-3 pb-3">
                <div className="flex min-w-0 items-baseline gap-2">
                  <h2 className="text-sm font-semibold">{t('sources.processedNodes')}</h2>
                  <Badge variant="secondary" className="text-xs tabular-nums font-normal">
                    {allNodes.length}
                  </Badge>
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

              {/* 明确放成两列（columns={2}），卡片间距舒适，完整看全节点名称与配置 */}
              <div className="rounded-lg border bg-card p-2">
                {allNodes.length ? (
                  <NodeList
                    nodes={allNodes}
                    columns={2}
                    className="max-h-[520px] overflow-y-auto pr-1"
                  />
                ) : (
                  <p className="py-8 text-center text-xs text-muted-foreground">
                    {t('common.none')}
                  </p>
                )}
              </div>

              <div className="mt-3 shrink-0 pt-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full justify-between text-xs"
                  onClick={() => setTab('nodes')}
                >
                  <span>{t('sources.viewAllNodes')}</span>
                  <ArrowRight className="size-3.5" />
                </Button>
              </div>
            </section>
          </div>
        </TabsContent>

        <TabsContent value="nodes" className="mt-4 flex min-h-0 flex-1 flex-col gap-3 outline-none">
          <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <Search className="absolute top-2.5 left-3 size-4 text-muted-foreground pointer-events-none" />
              <Input
                className="pl-9 h-9"
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

          <Card className="flex min-h-0 flex-1 flex-col overflow-hidden p-0">
            {filtered.length > 0 ? (
              <NodeList nodes={filtered} className="min-h-0 flex-1 overflow-y-auto p-3" />
            ) : (
              <p className="flex flex-1 items-center justify-center py-12 text-sm text-muted-foreground">
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
    <div className="rounded-lg border bg-muted/20 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 truncate text-sm font-semibold tabular-nums text-foreground">
        {value || '-'}
      </div>
    </div>
  );
}

function Warnings({ items }: { items: string[] }) {
  const { t } = useTranslation();
  return (
    <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-destructive">
      <div className="text-xs font-semibold">{t('outputs.warnings')}</div>
      <ul className="mt-1 space-y-1 text-xs">
        {items.map((warning) => (
          <li key={warning}>• {warning}</li>
        ))}
      </ul>
    </div>
  );
}
