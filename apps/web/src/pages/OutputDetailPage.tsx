import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  type Processor,
  type ProxyType,
  type SourceDto,
  TARGET_LABELS,
  TARGETS,
  type Target,
} from '@subhub/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Eye,
  GripVertical,
  Link2,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Search,
  Trash2,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { CopyButton } from '@/components/common/CopyButton';
import { PageHeader } from '@/components/common/PageHeader';
import { NodeList, ProtocolFilterBar } from '@/components/nodes/NodeList';
import { CopySubscription } from '@/components/outputs/CopySubscription';
import { OutputFormDialog } from '@/components/outputs/OutputFormDialog';
import { ProcessorEditor } from '@/components/outputs/ProcessorEditor';
import { TargetSharePanel } from '@/components/shares/TargetSharePanel';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';

export function OutputDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const outputId = Number(id);
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [processors, setProcessors] = useState<Processor[]>([]);
  const [sourceIds, setSourceIds] = useState<number[]>([]);
  const [dirty, setDirty] = useState(false);
  const [previewTarget, setPreviewTarget] = useState<Target | undefined>();
  const [nodeSearch, setNodeSearch] = useState('');
  const [protocolFilter, setProtocolFilter] = useState<ProxyType | 'all'>('all');
  const [hydrated, setHydrated] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const output = useQuery({
    queryKey: ['output', outputId],
    queryFn: () => api.getOutput(outputId),
    enabled: Number.isInteger(outputId) && outputId > 0,
  });
  const sources = useQuery({ queryKey: ['sources'], queryFn: api.listSources });

  useEffect(() => {
    if (!output.data) return;
    setProcessors(output.data.processors);
    setSourceIds(output.data.sourceIds);
    setDirty(false);
    setHydrated(true);
  }, [output.data]);

  const preview = useMutation({
    mutationFn: (payload: { target: Target; sourceIds: number[]; processors: Processor[] }) =>
      api.dryRunOutput(payload),
    onError: (error: Error) => toast.error(error.message),
  });

  const activePreviewTarget = previewTarget ?? output.data?.target ?? 'mihomo';

  const previewMutateRef = useRef(preview.mutate);
  previewMutateRef.current = preview.mutate;

  useEffect(() => {
    if (!hydrated || !output.data) return;
    const timer = window.setTimeout(() => {
      previewMutateRef.current({
        target: activePreviewTarget,
        sourceIds,
        processors,
      });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [hydrated, output.data, activePreviewTarget, sourceIds, processors]);

  const save = useMutation({
    mutationFn: () =>
      api.updateOutput(outputId, {
        processors,
        sourceIds,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['output', outputId] });
      void queryClient.invalidateQueries({ queryKey: ['outputs'] });
      setDirty(false);
      toast.success(t('common.save'));
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const filteredPreviewNodes = useMemo(() => {
    const list = preview.data?.nodes ?? [];
    const keyword = nodeSearch.trim().toLowerCase();
    return list.filter((node) => {
      if (protocolFilter !== 'all' && node.type !== protocolFilter) return false;
      if (!keyword) return true;
      return (
        node.name.toLowerCase().includes(keyword) ||
        node.server?.toLowerCase().includes(keyword) ||
        node.type.toLowerCase().includes(keyword)
      );
    });
  }, [preview.data, nodeSearch, protocolFilter]);

  if (output.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-24" />
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (!output.data) {
    return (
      <div className="py-12 text-center">
        <Link to="/outputs" className="text-sm font-medium underline underline-offset-4">
          {t('common.back')}
        </Link>
      </div>
    );
  }

  const data = output.data;
  const selectedSources = sourceIds
    .map((sourceId) => sources.data?.find((item) => item.id === sourceId))
    .filter((item): item is NonNullable<typeof item> => !!item);
  const availableSources = (sources.data ?? []).filter((item) => !sourceIds.includes(item.id));

  function moveSource(index: number, delta: number) {
    const target = index + delta;
    if (target < 0 || target >= sourceIds.length) return;
    const next = [...sourceIds];
    const [item] = next.splice(index, 1);
    if (item != null) next.splice(target, 0, item);
    setSourceIds(next);
    setDirty(true);
  }

  function handleSourceDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = sourceIds.indexOf(Number(active.id));
    const newIndex = sourceIds.indexOf(Number(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    setSourceIds(arrayMove(sourceIds, oldIndex, newIndex));
    setDirty(true);
  }

  function handleReset() {
    if (!output.data) return;
    setProcessors(output.data.processors);
    setSourceIds(output.data.sourceIds);
    setDirty(false);
  }

  function runManualPreview() {
    preview.mutate({
      target: activePreviewTarget,
      sourceIds,
      processors,
    });
  }

  const sourcesPanel = (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">{t('outputs.sources')}</h2>
          <span className="text-xs text-muted-foreground">{t('outputs.sourceOrder')}</span>
        </div>
        <Card className="overflow-hidden p-0">
          {selectedSources.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t('outputs.noSources')}
            </p>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleSourceDragEnd}
            >
              <SortableContext items={sourceIds} strategy={verticalListSortingStrategy}>
                <div className="divide-y divide-border">
                  {selectedSources.map((source, index) => (
                    <SortableSourceRow
                      key={source.id}
                      source={source}
                      index={index}
                      total={selectedSources.length}
                      onMove={moveSource}
                      onRemove={() => {
                        setSourceIds(sourceIds.filter((item) => item !== source.id));
                        setDirty(true);
                      }}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </Card>
      </div>

      {availableSources.length > 0 ? (
        <div className="space-y-2">
          <h3 className="text-xs font-medium text-muted-foreground">
            {t('outputs.selectSources')}
          </h3>
          <Card className="overflow-hidden p-0">
            <div className="divide-y divide-border">
              {availableSources.map((source) => (
                <button
                  key={source.id}
                  type="button"
                  onClick={() => {
                    setSourceIds([...sourceIds, source.id]);
                    setDirty(true);
                  }}
                  className="flex w-full items-center gap-2 p-3 text-left transition-colors hover:bg-muted/50 sm:px-4"
                >
                  <Plus className="size-3.5 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1 truncate text-sm">{source.name}</span>
                  <Badge variant="secondary" className="text-[11px] font-normal">
                    {source.kind === 'remote' ? t('sources.remote') : t('sources.manual')}
                  </Badge>
                  <Badge variant="outline" className="text-xs text-muted-foreground">
                    {source.nodeCount}
                  </Badge>
                </button>
              ))}
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );

  const processorsPanel = (
    <div className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold">{t('outputs.processors')}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">{t('outputs.processorsHint')}</p>
      </div>
      <ProcessorEditor
        value={processors}
        trace={preview.data?.trace}
        onChange={(next) => {
          setProcessors(next);
          setDirty(true);
        }}
      />
    </div>
  );

  const sharesPanel = <TargetSharePanel kind="output" targetId={outputId} />;

  const previewPanel = (
    <div className="flex flex-col gap-3">
      <Card className="shrink-0">
        <CardContent className="p-3 pt-3 sm:p-4 sm:pt-4 space-y-2">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-md border bg-muted/30 px-3 py-2">
              <Link2 className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">
                {window.location.origin}
                {data.url}
              </span>
            </div>
            <CopySubscription
              url={data.url}
              defaultTarget={data.target}
              showLabel
              variant="default"
              className="w-full sm:w-auto"
            />
          </div>
          <p className="text-xs text-muted-foreground">{t('outputs.linkTargetHint')}</p>
        </CardContent>
      </Card>

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-lg border bg-card/60 p-2.5">
        <p className="text-xs text-muted-foreground">{t('outputs.previewHint')}</p>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground hidden sm:inline">
            {t('outputs.previewTarget')}:
          </span>
          <Select
            value={activePreviewTarget}
            onValueChange={(value) => {
              setPreviewTarget(value as Target);
            }}
          >
            <SelectTrigger className="h-8 w-36 text-xs" aria-label={t('outputs.previewTarget')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TARGETS.map((target) => (
                <SelectItem key={target} value={target}>
                  {TARGET_LABELS[target]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {preview.data ? (
        <>
          {preview.data.dropped && preview.data.dropped.length > 0 ? (
            <div className="shrink-0 rounded-lg border border-warning/30 bg-warning/10 p-3 text-warning">
              <div className="flex items-center gap-1.5 text-xs font-semibold">
                <AlertTriangle className="size-3.5" />
                <span>
                  {t('outputs.droppedNodes')} ({preview.data.dropped.length})
                </span>
              </div>
              <ul className="mt-1.5 space-y-1 text-xs">
                {preview.data.dropped.slice(0, 8).map((item) => (
                  <li key={`${item.type}-${item.name}-${item.reason}`}>
                    • [{item.type}] {item.name}: {item.reason}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {preview.data.warnings.length > 0 ? (
            <div className="shrink-0 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-destructive">
              <div className="text-xs font-semibold">{t('outputs.warnings')}</div>
              <ul className="mt-1 space-y-1 text-xs">
                {preview.data.warnings.map((warning) => (
                  <li key={warning}>• {warning}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <Tabs defaultValue="nodes" className="flex flex-col">
            <TabsList className="w-full shrink-0 grid grid-cols-2 sm:w-fit sm:inline-flex">
              <TabsTrigger value="nodes" className="text-xs px-3">
                {t('outputs.cardView')} ({filteredPreviewNodes.length})
              </TabsTrigger>
              <TabsTrigger value="content" className="text-xs px-3">
                {t('outputs.textView')} ({preview.data.count})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="nodes" className="mt-3 outline-none">
              <Card className="overflow-hidden p-3 sm:p-4">
                <div className="space-y-3">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-2 size-3.5 text-muted-foreground" />
                    <Input
                      value={nodeSearch}
                      onChange={(e) => setNodeSearch(e.target.value)}
                      placeholder={t('outputs.searchNodes')}
                      className="h-8 pl-8 text-xs"
                    />
                  </div>
                  <ProtocolFilterBar
                    nodes={preview.data.nodes}
                    selected={protocolFilter}
                    onSelect={setProtocolFilter}
                    allLabel={t('common.all')}
                  />
                  <NodeList
                    nodes={filteredPreviewNodes}
                    columns={2}
                    className="max-h-[420px] overflow-y-auto pr-0.5"
                  />
                </div>
              </Card>
            </TabsContent>

            <TabsContent value="content" className="mt-3 outline-none">
              <Card className="relative overflow-hidden p-3 sm:p-4">
                <div className="absolute right-5 top-5 z-10 sm:right-6 sm:top-6">
                  <CopyButton value={preview.data.content} size="sm" variant="outline" />
                </div>
                <pre className="max-h-[480px] min-h-56 overflow-auto rounded-md bg-muted/40 p-3 pr-14 font-mono text-xs leading-relaxed">
                  {preview.data.content}
                </pre>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      ) : (
        <Card className="flex min-h-[220px] flex-1 items-center justify-center p-6 text-center">
          <div className="space-y-2">
            <Eye className="mx-auto size-8 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">{t('outputs.previewEmpty')}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={runManualPreview}
              disabled={preview.isPending}
            >
              {preview.isPending ? <Loader2 className="size-3.5 animate-spin mr-1" /> : null}
              {t('outputs.preview')}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );

  return (
    <div className="relative flex min-h-0 flex-1 flex-col pb-12">
      <div className="mb-2 shrink-0">
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="-ml-2 text-muted-foreground hover:text-foreground"
        >
          <Link to="/outputs">
            <ArrowLeft className="size-4 mr-1" />
            {t('common.back')}
          </Link>
        </Button>
      </div>

      <PageHeader
        title={data.name}
        description={`${t('outputs.defaultTarget')}: ${TARGET_LABELS[data.target]} · ${t('outputs.sources')} (${data.sources.length})`}
        action={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={runManualPreview}
              disabled={preview.isPending}
            >
              {preview.isPending ? (
                <Loader2 className="size-3.5 animate-spin mr-1" />
              ) : (
                <Eye className="size-3.5 mr-1" />
              )}
              <span>{t('outputs.preview')}</span>
            </Button>
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              <Pencil className="size-3.5 mr-1" />
              <span>{t('common.edit')}</span>
            </Button>
          </div>
        }
      />

      {/* Mobile / Tablet tabbed layout */}
      <Tabs defaultValue="preview" className="min-h-0 flex-1 flex flex-col lg:hidden">
        <TabsList className="w-full shrink-0 grid grid-cols-4">
          <TabsTrigger value="preview" className="text-xs px-1">
            {t('outputs.preview')}
          </TabsTrigger>
          <TabsTrigger value="sources" className="text-xs px-1">
            {t('outputs.sources')}
          </TabsTrigger>
          <TabsTrigger value="processors" className="text-xs px-1">
            {t('outputs.processors')}
          </TabsTrigger>
          <TabsTrigger value="shares" className="text-xs px-1">
            {t('nav.shares')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="preview" className="mt-4 min-h-0 flex-1 overflow-y-auto outline-none">
          {previewPanel}
        </TabsContent>
        <TabsContent value="sources" className="mt-4 min-h-0 flex-1 overflow-y-auto outline-none">
          {sourcesPanel}
        </TabsContent>
        <TabsContent
          value="processors"
          className="mt-4 min-h-0 flex-1 overflow-y-auto outline-none"
        >
          {processorsPanel}
        </TabsContent>
        <TabsContent value="shares" className="mt-4 min-h-0 flex-1 overflow-y-auto outline-none">
          {sharesPanel}
        </TabsContent>
      </Tabs>

      {/* Desktop 2-column workspace */}
      <div className="hidden lg:grid lg:min-h-0 lg:flex-1 lg:grid-cols-12 lg:gap-6">
        <Tabs defaultValue="sources" className="lg:col-span-5 flex min-h-0 flex-col">
          <TabsList className="w-full shrink-0 grid grid-cols-3">
            <TabsTrigger value="sources" className="text-xs">
              {t('outputs.sources')}
            </TabsTrigger>
            <TabsTrigger value="processors" className="text-xs">
              {t('outputs.processors')}
            </TabsTrigger>
            <TabsTrigger value="shares" className="text-xs">
              {t('nav.shares')}
            </TabsTrigger>
          </TabsList>

          <TabsContent
            value="sources"
            className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1 outline-none"
          >
            {sourcesPanel}
          </TabsContent>
          <TabsContent
            value="processors"
            className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1 outline-none"
          >
            {processorsPanel}
          </TabsContent>
          <TabsContent
            value="shares"
            className="mt-4 min-h-0 flex-1 overflow-y-auto pr-1 outline-none"
          >
            {sharesPanel}
          </TabsContent>
        </Tabs>

        <div className="lg:col-span-7 flex min-h-0 flex-col overflow-y-auto pl-1">
          {previewPanel}
        </div>
      </div>

      {/* Floating Save Bar */}
      {dirty ? (
        <div className="fixed bottom-16 sm:bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 rounded-full border border-border bg-background/95 px-4 py-2.5 shadow-lg backdrop-blur-md transition-all animate-in fade-in slide-in-from-bottom-3">
          <span className="text-xs sm:text-sm font-medium text-foreground whitespace-nowrap">
            {t('common.unsavedChanges', '有未保存的改动')}
          </span>
          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2.5 text-xs text-muted-foreground hover:text-foreground"
              onClick={handleReset}
            >
              <RotateCcw className="size-3 mr-1" />
              {t('common.reset', '重置')}
            </Button>
            <Button
              size="sm"
              className="h-7 px-3 text-xs"
              onClick={() => save.mutate()}
              disabled={save.isPending}
            >
              {save.isPending ? (
                <Loader2 className="size-3 animate-spin mr-1" />
              ) : (
                <Save className="size-3 mr-1" />
              )}
              {t('common.save')}
            </Button>
          </div>
        </div>
      ) : null}

      <OutputFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        output={data}
        sources={sources.data ?? []}
        onSaved={() => {
          void queryClient.invalidateQueries({ queryKey: ['output', outputId] });
        }}
      />
    </div>
  );
}

function SortableSourceRow({
  source,
  index,
  total,
  onMove,
  onRemove,
}: {
  source: SourceDto;
  index: number;
  total: number;
  onMove: (index: number, delta: number) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: source.id,
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'flex items-center gap-2 bg-card p-3 sm:px-4',
        isDragging && 'relative z-10 shadow-md ring-1 ring-primary/30',
      )}
    >
      <button
        type="button"
        className="cursor-grab touch-none text-muted-foreground hover:text-foreground active:cursor-grabbing"
        aria-label={t('outputs.sourceOrder')}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{source.name}</span>
      {!source.enabled ? (
        <Badge variant="outline" className="border-warning/40 text-warning text-[10px]">
          {t('outputs.sourceDisabledBadge')}
        </Badge>
      ) : null}
      <Badge variant="outline" className="text-xs text-muted-foreground">
        {source.nodeCount}
      </Badge>
      <div className="flex items-center gap-0.5">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => onMove(index, -1)}
          disabled={index === 0}
          title={t('common.moveUp')}
        >
          <ArrowUp className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => onMove(index, 1)}
          disabled={index === total - 1}
          title={t('common.moveDown')}
        >
          <ArrowDown className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-destructive hover:text-destructive"
          onClick={onRemove}
          title={t('common.delete')}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}
