import {
  type Processor,
  type ProxyNode,
  type ProxyType,
  SOURCE_DEFAULT_TARGET,
} from '@subhub/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  FileUp,
  Globe,
  Link2,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Send,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { CopyButton } from '@/components/common/CopyButton';
import { FlowBar } from '@/components/common/FlowBar';
import { PageHeader } from '@/components/common/PageHeader';
import { NodeList, ProtocolFilterBar } from '@/components/nodes/NodeList';
import { CopySubscription } from '@/components/outputs/CopySubscription';
import { ProcessorEditor } from '@/components/outputs/ProcessorEditor';
import { TargetSharePanel } from '@/components/shares/TargetSharePanel';
import { BatchImportDialog } from '@/components/sources/BatchImportDialog';
import { NodeEditorDialog } from '@/components/sources/NodeEditorDialog';
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
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get('tab');
  const sourceId = Number(id);
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [nodeEditorOpen, setNodeEditorOpen] = useState(false);
  const [editingNodeIndex, setEditingNodeIndex] = useState<number | null>(null);
  const [batchImportOpen, setBatchImportOpen] = useState(false);
  const [tab, setTab] = useState(
    initialTab === 'nodes' || initialTab === 'processors' ? initialTab : 'overview',
  );
  const [search, setSearch] = useState('');
  const [protocolFilter, setProtocolFilter] = useState<ProxyType | 'all'>('all');
  const [processors, setProcessors] = useState<Processor[]>([]);
  const [selectedOrigIndices, setSelectedOrigIndices] = useState<Set<number>>(new Set());

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

  const saveManualNodes = useMutation({
    mutationFn: (nextNodes: ProxyNode[]) => api.updateSource(sourceId, { nodes: nextNodes }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['source', sourceId] });
      void queryClient.invalidateQueries({ queryKey: ['source-nodes', sourceId] });
      void queryClient.invalidateQueries({ queryKey: ['sources'] });
      setNodeEditorOpen(false);
      setBatchImportOpen(false);
      setEditingNodeIndex(null);
      toast.success(t('common.save'));
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const filtered = useMemo(() => {
    const list = nodes.data?.nodes ?? [];
    const keyword = search.trim().toLowerCase();
    return list.filter((node) => {
      if (protocolFilter !== 'all' && node.type !== protocolFilter) return false;
      if (!keyword) return true;
      return (
        node.name.toLowerCase().includes(keyword) ||
        node.server?.toLowerCase().includes(keyword) ||
        node.hostname?.toLowerCase().includes(keyword) ||
        node.type.toLowerCase().includes(keyword)
      );
    });
  }, [nodes.data, search, protocolFilter]);

  const allNodes = nodes.data?.nodes ?? [];
  const warnings = nodes.data?.warnings ?? [];

  const duplicateCount = useMemo(() => {
    const seen = new Set<string>();
    let dup = 0;
    for (const node of allNodes) {
      const key = `${node.type}|${node.server ?? node.hostname ?? ''}|${node.port ?? ''}`;
      if (seen.has(key)) dup += 1;
      else seen.add(key);
    }
    return dup;
  }, [allNodes]);

  const filteredSelectedSet = useMemo(() => {
    const set = new Set<number>();
    filtered.forEach((node, idx) => {
      const origIdx = allNodes.indexOf(node);
      if (origIdx >= 0 && selectedOrigIndices.has(origIdx)) set.add(idx);
    });
    return set;
  }, [filtered, allNodes, selectedOrigIndices]);

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

  function dedupeManualNodes() {
    const seen = new Set<string>();
    const deduped = allNodes.filter((node) => {
      const key = `${node.type}|${node.server ?? node.hostname ?? ''}|${node.port ?? ''}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    setSelectedOrigIndices(new Set());
    saveManualNodes.mutate(deduped);
  }

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
            <CardContent className="space-y-4 p-4 sm:p-6">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 sm:gap-6">
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
              </div>
              {data.flow ? <FlowBar flow={data.flow} /> : null}
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

          <TargetSharePanel kind="source" targetId={sourceId} />
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
            <div className="flex items-center justify-between gap-2 sm:justify-end">
              <span className="text-xs text-muted-foreground sm:shrink-0">
                {t('outputs.nodeResults', { count: filtered.length })}
              </span>
              {data.kind === 'manual' ? (
                <div className="flex items-center gap-1.5">
                  <Button variant="outline" size="sm" onClick={() => setBatchImportOpen(true)}>
                    <FileUp className="size-3.5 mr-1" />
                    {t('sources.batchImport')}
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      setEditingNodeIndex(null);
                      setNodeEditorOpen(true);
                    }}
                  >
                    <Plus className="size-3.5 mr-1" />
                    {t('sources.addNode')}
                  </Button>
                </div>
              ) : null}
            </div>
          </div>

          <ProtocolFilterBar
            nodes={allNodes}
            selected={protocolFilter}
            onSelect={setProtocolFilter}
            allLabel={t('common.all')}
          />

          {warnings.length ? <Warnings items={warnings} /> : null}

          {data.kind === 'manual' && duplicateCount > 0 ? (
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
              <span>{t('sources.duplicateFound', { count: duplicateCount })}</span>
              <Button
                variant="outline"
                size="sm"
                className="h-7 border-warning/40 text-warning hover:bg-warning/15"
                onClick={dedupeManualNodes}
                disabled={saveManualNodes.isPending}
              >
                {t('sources.dedupeNow')}
              </Button>
            </div>
          ) : null}

          {data.kind === 'manual' && selectedOrigIndices.size > 0 ? (
            <div className="flex shrink-0 items-center justify-between gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-xs">
              <span className="font-medium">
                {t('sources.selectedCount', { count: selectedOrigIndices.size })}
              </span>
              <div className="flex items-center gap-1.5">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setSelectedOrigIndices(new Set())}
                >
                  {t('common.cancel')}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  className="h-7 text-xs"
                  disabled={saveManualNodes.isPending}
                  onClick={() => {
                    const next = allNodes.filter((_, i) => !selectedOrigIndices.has(i));
                    setSelectedOrigIndices(new Set());
                    saveManualNodes.mutate(next);
                  }}
                >
                  {t('sources.deleteSelected')}
                </Button>
              </div>
            </div>
          ) : null}

          <Card className="flex min-h-0 flex-1 flex-col overflow-hidden p-0">
            {filtered.length > 0 ? (
              <NodeList
                nodes={filtered}
                className="min-h-0 flex-1 overflow-y-auto p-3"
                selectable={data.kind === 'manual'}
                selectedIndices={filteredSelectedSet}
                onToggleSelect={(idx) => {
                  const targetNode = filtered[idx];
                  if (!targetNode) return;
                  const origIdx = allNodes.indexOf(targetNode);
                  if (origIdx < 0) return;
                  setSelectedOrigIndices((prev) => {
                    const next = new Set(prev);
                    if (next.has(origIdx)) next.delete(origIdx);
                    else next.add(origIdx);
                    return next;
                  });
                }}
                onEditNode={
                  data.kind === 'manual'
                    ? (idx) => {
                        const targetNode = filtered[idx];
                        if (!targetNode) return;
                        const origIdx = allNodes.indexOf(targetNode);
                        if (origIdx >= 0) {
                          setEditingNodeIndex(origIdx);
                          setNodeEditorOpen(true);
                        }
                      }
                    : undefined
                }
                onDeleteNode={
                  data.kind === 'manual'
                    ? (idx) => {
                        const targetNode = filtered[idx];
                        if (!targetNode) return;
                        const origIdx = allNodes.indexOf(targetNode);
                        if (origIdx >= 0) {
                          const next = allNodes.filter((_, i) => i !== origIdx);
                          saveManualNodes.mutate(next);
                        }
                      }
                    : undefined
                }
              />
            ) : data.kind === 'manual' && allNodes.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center gap-3 py-12 text-center">
                <p className="text-sm text-muted-foreground">{t('sources.nodeFormHint')}</p>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setBatchImportOpen(true)}>
                    <FileUp className="size-3.5 mr-1" />
                    {t('sources.batchImport')}
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      setEditingNodeIndex(null);
                      setNodeEditorOpen(true);
                    }}
                  >
                    <Plus className="size-3.5 mr-1" />
                    {t('sources.addNode')}
                  </Button>
                </div>
              </div>
            ) : (
              <p className="flex flex-1 items-center justify-center py-12 text-sm text-muted-foreground">
                {t('common.none')}
              </p>
            )}
          </Card>
        </TabsContent>
      </Tabs>

      <SourceFormDialog open={editOpen} onOpenChange={setEditOpen} source={data} />

      {data.kind === 'manual' ? (
        <>
          <NodeEditorDialog
            open={nodeEditorOpen}
            onOpenChange={setNodeEditorOpen}
            initialNode={editingNodeIndex !== null ? allNodes[editingNodeIndex] : undefined}
            saving={saveManualNodes.isPending}
            onSave={(node: ProxyNode) => {
              const next =
                editingNodeIndex !== null
                  ? allNodes.map((n, i) => (i === editingNodeIndex ? node : n))
                  : [...allNodes, node];
              saveManualNodes.mutate(next, {
                onSuccess: () => setNodeEditorOpen(false),
              });
            }}
          />
          <BatchImportDialog
            open={batchImportOpen}
            onOpenChange={setBatchImportOpen}
            saving={saveManualNodes.isPending}
            onImport={(imported: ProxyNode[], mode) => {
              const next = mode === 'replace' ? imported : [...allNodes, ...imported];
              saveManualNodes.mutate(next, {
                onSuccess: () => setBatchImportOpen(false),
              });
            }}
          />
        </>
      ) : null}
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
