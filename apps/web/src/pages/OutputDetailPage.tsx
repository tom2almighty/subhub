import { type Processor, TARGET_LABELS, TARGETS, type Target } from '@subhub/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Eye,
  Link2,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  Save,
  Trash2,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { CopyButton } from '@/components/common/CopyButton';
import { PageHeader } from '@/components/common/PageHeader';
import { NodeList } from '@/components/nodes/NodeList';
import { CopySubscription } from '@/components/outputs/CopySubscription';
import { OutputFormDialog } from '@/components/outputs/OutputFormDialog';
import { ProcessorEditor } from '@/components/outputs/ProcessorEditor';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  }, [output.data]);

  const save = useMutation({
    mutationFn: () => api.updateOutput(outputId, { processors, sourceIds }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['output', outputId] });
      void queryClient.invalidateQueries({ queryKey: ['outputs'] });
      setDirty(false);
      preview.mutate(previewTarget);
      toast.success(t('common.save'));
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const preview = useMutation({
    mutationFn: (target?: Target) => api.previewOutput(outputId, target),
    onError: (error: Error) => toast.error(error.message),
  });

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
  const activePreviewTarget = previewTarget ?? data.target;
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

  function handleReset() {
    if (!output.data) return;
    setProcessors(output.data.processors);
    setSourceIds(output.data.sourceIds);
    setDirty(false);
  }

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
              onClick={() => preview.mutate(activePreviewTarget)}
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

      <Tabs defaultValue="preview" className="min-h-0 flex-1 flex flex-col">
        <TabsList className="w-full shrink-0 grid grid-cols-3 sm:w-fit sm:inline-flex">
          <TabsTrigger value="preview" className="text-xs sm:text-sm px-2 sm:px-4">
            {t('outputs.preview')}
          </TabsTrigger>
          <TabsTrigger value="processors" className="text-xs sm:text-sm px-2 sm:px-4">
            {t('outputs.processors')}
          </TabsTrigger>
          <TabsTrigger value="sources" className="text-xs sm:text-sm px-2 sm:px-4">
            {t('outputs.sources')}
          </TabsTrigger>
        </TabsList>

        <TabsContent
          value="preview"
          className="mt-4 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto outline-none"
        >
          <Card className="shrink-0">
            <CardContent className="p-3 sm:p-4 space-y-2">
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
                  const target = value as Target;
                  setPreviewTarget(target);
                  if (preview.data) preview.mutate(target);
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

              <div className="grid gap-4 lg:grid-cols-5">
                <Card className="flex flex-col lg:col-span-3">
                  <CardHeader className="flex flex-row items-center justify-between py-3 border-b border-border/60">
                    <CardTitle className="text-xs font-medium text-muted-foreground">
                      {t('outputs.generatedNodes')} ({preview.data.count})
                    </CardTitle>
                    <CopyButton value={preview.data.content} size="sm" variant="outline" />
                  </CardHeader>
                  <CardContent className="p-3">
                    <pre className="max-h-96 min-h-48 overflow-auto rounded-md bg-muted/40 p-3 font-mono text-xs leading-relaxed">
                      {preview.data.content}
                    </pre>
                  </CardContent>
                </Card>

                <Card className="flex flex-col lg:col-span-2">
                  <CardHeader className="flex flex-row items-center justify-between py-3 border-b border-border/60">
                    <CardTitle className="text-xs font-medium text-muted-foreground">
                      {t('outputs.nodeList')}
                    </CardTitle>
                    <Badge variant="secondary" className="text-xs tabular-nums font-normal">
                      {preview.data.count}
                    </Badge>
                  </CardHeader>
                  <CardContent className="p-3">
                    <NodeList nodes={preview.data.nodes} className="max-h-96 overflow-y-auto" />
                  </CardContent>
                </Card>
              </div>
            </>
          ) : (
            <Card className="flex min-h-[220px] flex-1 items-center justify-center p-6 text-center">
              <div className="space-y-2">
                <Eye className="mx-auto size-8 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">{t('outputs.previewEmpty')}</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => preview.mutate(activePreviewTarget)}
                  disabled={preview.isPending}
                >
                  {preview.isPending ? <Loader2 className="size-3.5 animate-spin mr-1" /> : null}
                  {t('outputs.preview')}
                </Button>
              </div>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="processors" className="mt-4 flex min-h-0 flex-1 flex-col outline-none">
          <div className="shrink-0 pb-3">
            <h2 className="text-sm font-semibold">{t('outputs.processors')}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">{t('outputs.processorsHint')}</p>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
            <ProcessorEditor
              value={processors}
              onChange={(next) => {
                setProcessors(next);
                setDirty(true);
              }}
            />
          </div>
        </TabsContent>

        <TabsContent
          value="sources"
          className="mt-4 min-h-0 flex-1 space-y-4 overflow-y-auto outline-none"
        >
          <Card className="overflow-hidden p-0">
            {selectedSources.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {t('outputs.noSources')}
              </p>
            ) : (
              <div className="divide-y divide-border">
                {selectedSources.map((source, index) => (
                  <div key={source.id} className="flex items-center gap-2 p-3 sm:px-4">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {source.name}
                    </span>
                    <Badge variant="outline" className="text-xs text-muted-foreground">
                      {source.nodeCount}
                    </Badge>
                    <div className="flex items-center gap-0.5">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => moveSource(index, -1)}
                        disabled={index === 0}
                        title="Up"
                      >
                        <ArrowUp className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => moveSource(index, 1)}
                        disabled={index === selectedSources.length - 1}
                        title="Down"
                      >
                        <ArrowDown className="size-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => {
                          setSourceIds(sourceIds.filter((item) => item !== source.id));
                          setDirty(true);
                        }}
                        title={t('common.delete')}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {availableSources.length > 0 ? (
            <AddSource
              sources={availableSources}
              onAdd={(sourceId) => {
                setSourceIds([...sourceIds, sourceId]);
                setDirty(true);
              }}
            />
          ) : null}
        </TabsContent>
      </Tabs>

      {/* Floating Save Bar for mobile and desktop */}
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

function AddSource({
  sources,
  onAdd,
}: {
  sources: { id: number; name: string }[];
  onAdd: (id: number) => void;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState('');
  return (
    <div className="flex gap-2">
      <Select value={value} onValueChange={setValue}>
        <SelectTrigger className="flex-1">
          <SelectValue placeholder={t('outputs.selectSources')} />
        </SelectTrigger>
        <SelectContent>
          {sources.map((source) => (
            <SelectItem key={source.id} value={`${source.id}`}>
              {source.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        variant="outline"
        disabled={!value}
        onClick={() => {
          const id = Number(value);
          if (Number.isInteger(id) && id > 0) {
            onAdd(id);
            setValue('');
          }
        }}
      >
        <Plus className="size-4 mr-1" />
        <span>{t('common.add', '添加')}</span>
      </Button>
    </div>
  );
}
