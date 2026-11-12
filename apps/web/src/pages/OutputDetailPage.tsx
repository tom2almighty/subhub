import { type Processor, type ShareDto, TARGET_LABELS, TARGETS, type Target } from '@subhub/shared';
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
  Save,
  Trash2,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { CopyButton } from '@/components/common/CopyButton';
import { PageHeader } from '@/components/common/PageHeader';
import { NodeList } from '@/components/nodes/NodeList';
import { CopySubscription } from '@/components/outputs/CopySubscription';
import { OutputFormDialog } from '@/components/outputs/OutputFormDialog';
import { ProcessorEditor } from '@/components/outputs/ProcessorEditor';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { formatDate } from '@/lib/format';

export function OutputDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const outputId = Number(id);
  const queryClient = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [processors, setProcessors] = useState<Processor[]>([]);
  const [sourceIds, setSourceIds] = useState<number[]>([]);
  const [dirty, setDirty] = useState(false);
  const [deletingShare, setDeletingShare] = useState<ShareDto | undefined>();
  const [editingShare, setEditingShare] = useState<ShareDto | undefined>();
  const [previewTarget, setPreviewTarget] = useState<Target | undefined>();

  const output = useQuery({
    queryKey: ['output', outputId],
    queryFn: () => api.getOutput(outputId),
    enabled: Number.isInteger(outputId) && outputId > 0,
  });
  const sources = useQuery({ queryKey: ['sources'], queryFn: api.listSources });
  const shares = useQuery({
    queryKey: ['shares', outputId],
    queryFn: () => api.listShares(outputId),
    enabled: Number.isInteger(outputId) && outputId > 0,
  });

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

  const createShare = useMutation({
    mutationFn: (body: { note: string; expiresInDays: number; maxUses: number }) =>
      api.createShare(outputId, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['shares', outputId] });
      void queryClient.invalidateQueries({ queryKey: ['outputs'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const updateNote = useMutation({
    mutationFn: ({ id, note }: { id: number; note: string }) => api.updateShare(id, note),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['shares', outputId] });
      setEditingShare(undefined);
      toast.success(t('common.save'));
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const removeShare = useMutation({
    mutationFn: api.deleteShare,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['shares', outputId] });
      void queryClient.invalidateQueries({ queryKey: ['outputs'] });
      setDeletingShare(undefined);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (output.isLoading) return <Skeleton className="h-40 w-full" />;
  if (!output.data) {
    return (
      <Link to="/outputs" className="text-sm underline">
        {t('common.back')}
      </Link>
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

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="mb-3 shrink-0">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link to="/outputs">
            <ArrowLeft className="size-4" />
            {t('common.back')}
          </Link>
        </Button>
      </div>
      <PageHeader
        title={data.name}
        description={`${t('outputs.defaultTarget')}: ${TARGET_LABELS[data.target]} · ${t(
          'outputs.sources',
        )} ${data.sources.length}`}
        action={
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              aria-label={t('outputs.preview')}
              onClick={() => preview.mutate(activePreviewTarget)}
              disabled={preview.isPending}
            >
              {preview.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Eye className="size-4" />
              )}
              <span className="hidden sm:inline">{t('outputs.preview')}</span>
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

      <Tabs defaultValue="preview" className="min-h-0 flex-1">
        <TabsList className="w-full shrink-0 sm:w-fit">
          <TabsTrigger value="preview" className="flex-1 sm:flex-none sm:px-4">
            {t('outputs.preview')}
          </TabsTrigger>
          <TabsTrigger value="processors" className="flex-1 sm:flex-none sm:px-4">
            {t('outputs.processors')}
          </TabsTrigger>
          <TabsTrigger value="sources" className="flex-1 sm:flex-none sm:px-4">
            {t('outputs.sources')}
          </TabsTrigger>
          <TabsTrigger value="shares" className="flex-1 sm:flex-none sm:px-4">
            {t('outputs.links')}
          </TabsTrigger>
        </TabsList>

        <TabsContent
          value="preview"
          className="mt-4 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto lg:overflow-hidden"
        >
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">{t('outputs.previewHint')}</p>
            <Select
              value={activePreviewTarget}
              onValueChange={(value) => {
                const target = value as Target;
                setPreviewTarget(target);
                if (preview.data) preview.mutate(target);
              }}
            >
              <SelectTrigger className="h-8 w-40" aria-label={t('outputs.previewTarget')}>
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
          {preview.data ? (
            <>
              {preview.data.warnings.length > 0 ? (
                <div className="shrink-0 border-l-2 border-destructive pl-3">
                  <div className="text-xs font-medium text-destructive">
                    {t('outputs.warnings')}
                  </div>
                  <ul className="mt-1 space-y-1 text-xs text-destructive">
                    {preview.data.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <div className="grid gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-5">
                <Card className="flex min-w-0 flex-col gap-0 lg:col-span-3 lg:min-h-0">
                  <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
                    <CardTitle className="text-xs font-normal text-muted-foreground">
                      {t('outputs.generatedNodes')} ({preview.data.count})
                    </CardTitle>
                    <CopyButton value={preview.data.content} size="sm" variant="outline" />
                  </CardHeader>
                  <CardContent className="min-w-0 min-h-0 lg:flex-1">
                    <pre className="h-72 overflow-auto rounded-md bg-muted/40 p-3 font-mono text-xs lg:h-full">
                      {preview.data.content}
                    </pre>
                  </CardContent>
                </Card>
                <Card className="flex min-w-0 flex-col gap-0 lg:col-span-2 lg:min-h-0">
                  <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
                    <CardTitle className="text-xs font-normal text-muted-foreground">
                      {t('outputs.nodeList')}
                    </CardTitle>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {preview.data.count}
                    </span>
                  </CardHeader>
                  <CardContent className="@container min-w-0 min-h-0 lg:flex-1 lg:overflow-hidden">
                    <NodeList
                      nodes={preview.data.nodes}
                      className="max-h-72 overflow-y-auto p-3 lg:h-full lg:max-h-none"
                    />
                  </CardContent>
                </Card>
              </div>
            </>
          ) : (
            <Card className="flex min-h-0 flex-1 items-center justify-center py-0">
              <p className="py-12 text-center text-sm text-muted-foreground">
                {t('outputs.previewEmpty')}
              </p>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="processors" className="mt-4 flex min-h-0 flex-1 flex-col">
          <div className="shrink-0 pb-3">
            <h2 className="text-sm font-medium">{t('outputs.processors')}</h2>
            <p className="mt-1 text-xs text-muted-foreground">{t('outputs.processorsHint')}</p>
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
          {dirty ? (
            <div className="mt-3 flex shrink-0 justify-end border-t pt-3">
              <Button onClick={() => save.mutate()} disabled={save.isPending}>
                <Save className="size-4" />
                {t('common.save')}
              </Button>
            </div>
          ) : null}
        </TabsContent>

        <TabsContent value="sources" className="mt-4 min-h-0 flex-1 space-y-4 overflow-y-auto">
          <Card className="gap-0 overflow-hidden py-0">
            {selectedSources.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {t('outputs.noSources')}
              </p>
            ) : (
              <div className="divide-y divide-border/60">
                {selectedSources.map((source, index) => (
                  <div key={source.id} className="flex items-center gap-2 px-4 py-2.5">
                    <span className="min-w-0 flex-1 truncate text-sm">{source.name}</span>
                    <span className="text-xs text-muted-foreground">{source.nodeCount}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      onClick={() => moveSource(index, -1)}
                      disabled={index === 0}
                    >
                      <ArrowUp className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      onClick={() => moveSource(index, 1)}
                      disabled={index === selectedSources.length - 1}
                    >
                      <ArrowDown className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-destructive"
                      onClick={() => {
                        setSourceIds(sourceIds.filter((item) => item !== source.id));
                        setDirty(true);
                      }}
                    >
                      <Trash2 className="size-4" />
                    </Button>
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
          {dirty ? (
            <div className="flex justify-end">
              <Button onClick={() => save.mutate()} disabled={save.isPending}>
                <Save className="size-4" />
                {t('common.save')}
              </Button>
            </div>
          ) : null}
        </TabsContent>

        <TabsContent value="shares" className="mt-4 min-h-0 flex-1 space-y-4 overflow-y-auto">
          <Card className="gap-0">
            <CardHeader className="pb-3">
              <CardTitle>{t('outputs.myLink')}</CardTitle>
              <CardDescription>{t('outputs.myLinkHint')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-2 rounded-md border bg-muted/20 px-3 py-2">
                  <Link2 className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate font-mono text-xs">
                    {window.location.origin}
                    {data.url}
                  </span>
                </div>
                <CopySubscription
                  url={data.url}
                  defaultTarget={data.target}
                  showLabel
                  variant="outline"
                  className="w-full sm:w-auto"
                />
              </div>
              <p className="text-xs text-muted-foreground">{t('outputs.linkTargetHint')}</p>
            </CardContent>
          </Card>

          <CreateShare
            onSubmit={(body) => createShare.mutate(body)}
            pending={createShare.isPending}
          />
          <Card className="gap-0 overflow-hidden py-0">
            {shares.data?.length ? (
              <div className="divide-y divide-border/60">
                {shares.data.map((share) => {
                  const absolute = `${window.location.origin}${share.url}`;
                  return (
                    <div key={share.id} className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Link2 className="size-4 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1 truncate font-mono text-xs">
                          {absolute}
                        </span>
                        <CopySubscription url={share.url} defaultTarget={data.target} />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          aria-label={t('outputs.editNote')}
                          onClick={() => setEditingShare(share)}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8 text-destructive"
                          aria-label={t('common.delete')}
                          onClick={() => setDeletingShare(share)}
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                      <div className="mt-2 truncate text-sm">
                        {share.note || (
                          <span className="text-muted-foreground">{t('outputs.noNote')}</span>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span>
                          {t('outputs.maxUses')}: {share.maxUses || t('common.unlimited')}
                        </span>
                        <span>
                          {t('sources.used')}: {share.usedCount}
                        </span>
                        <span>
                          {t('sources.expire')}:{' '}
                          {share.expiresAt ? formatDate(share.expiresAt) : t('common.never')}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-6 text-center text-sm text-muted-foreground">
                {t('outputs.sharesEmpty')}
              </div>
            )}
          </Card>
          <p className="text-xs text-muted-foreground">{t('outputs.shareTargetHint')}</p>
        </TabsContent>
      </Tabs>

      <OutputFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        output={data}
        sources={sources.data ?? []}
        onSaved={() => {
          void queryClient.invalidateQueries({ queryKey: ['output', outputId] });
        }}
      />
      <EditNoteDialog
        share={editingShare}
        onClose={() => setEditingShare(undefined)}
        onSave={(note) => {
          if (editingShare) updateNote.mutate({ id: editingShare.id, note });
        }}
        pending={updateNote.isPending}
      />
      <ConfirmDialog
        open={!!deletingShare}
        onOpenChange={(open) => !open && setDeletingShare(undefined)}
        title={t('outputs.revoke')}
        onConfirm={() => {
          if (deletingShare) removeShare.mutate(deletingShare.id);
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
        <Plus className="size-4" />
      </Button>
    </div>
  );
}

function CreateShare({
  onSubmit,
  pending,
}: {
  onSubmit: (body: { note: string; expiresInDays: number; maxUses: number }) => void;
  pending: boolean;
}) {
  const { t } = useTranslation();
  const [note, setNote] = useState('');
  const [expiresInDays, setExpiresInDays] = useState('0');
  const [maxUses, setMaxUses] = useState('0');
  return (
    <Card className="gap-0">
      <CardHeader className="pb-3">
        <CardTitle>{t('outputs.createShare')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="share-note" className="text-xs text-muted-foreground">
            {t('outputs.shareNote')}
          </Label>
          <Input
            id="share-note"
            maxLength={200}
            placeholder={t('outputs.shareNotePlaceholder')}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{t('outputs.expiresInDays')}</Label>
            <Input
              type="number"
              inputMode="numeric"
              value={expiresInDays}
              onChange={(event) => setExpiresInDays(event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">{t('outputs.maxUses')}</Label>
            <Input
              type="number"
              inputMode="numeric"
              value={maxUses}
              onChange={(event) => setMaxUses(event.target.value)}
            />
          </div>
        </div>
      </CardContent>
      <CardFooter>
        <Button
          variant="outline"
          className="w-full"
          disabled={pending}
          onClick={() =>
            onSubmit({
              note: note.trim(),
              expiresInDays: Number.parseInt(expiresInDays, 10) || 0,
              maxUses: Number.parseInt(maxUses, 10) || 0,
            })
          }
        >
          <Plus className="size-4" />
          {t('outputs.createShare')}
        </Button>
      </CardFooter>
    </Card>
  );
}

function EditNoteDialog({
  share,
  onClose,
  onSave,
  pending,
}: {
  share?: ShareDto;
  onClose: () => void;
  onSave: (note: string) => void;
  pending: boolean;
}) {
  const { t } = useTranslation();
  const [note, setNote] = useState(share?.note ?? '');

  useEffect(() => {
    setNote(share?.note ?? '');
  }, [share]);

  return (
    <Dialog open={!!share} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('outputs.editNote')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="edit-share-note">{t('outputs.shareNote')}</Label>
          <Input
            id="edit-share-note"
            maxLength={200}
            placeholder={t('outputs.shareNotePlaceholder')}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
          <p className="text-xs text-muted-foreground">{t('outputs.shareNoteHint')}</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => onSave(note.trim())} disabled={pending}>
            {t('outputs.saveNote')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
