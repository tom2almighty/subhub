import type { OutputDto, ShareDto, ShareTargetKind, SourceDto } from '@subhub/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link2, Loader2, Pencil, Plus, Share2, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { PageHeader } from '@/components/common/PageHeader';
import { CopySubscription } from '@/components/outputs/CopySubscription';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { api } from '@/lib/api';
import { formatDate } from '@/lib/format';

interface ShareBody {
  kind: ShareTargetKind;
  targetId: number;
  note: string;
  expiresInDays: number;
  maxUses: number;
}

export function SharesPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<ShareDto | undefined>();
  const [deleting, setDeleting] = useState<ShareDto | undefined>();

  const shares = useQuery({ queryKey: ['shares'], queryFn: api.listShares });
  const sources = useQuery({ queryKey: ['sources'], queryFn: api.listSources });
  const outputs = useQuery({ queryKey: ['outputs'], queryFn: api.listOutputs });

  const createShare = useMutation({
    mutationFn: (body: ShareBody) => api.createShare(body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['shares'] });
      void queryClient.invalidateQueries({ queryKey: ['outputs'] });
      setCreateOpen(false);
      toast.success(t('shares.create'));
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const updateNote = useMutation({
    mutationFn: ({ id, note }: { id: number; note: string }) => api.updateShare(id, note),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['shares'] });
      setEditing(undefined);
      toast.success(t('common.save'));
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const removeShare = useMutation({
    mutationFn: api.deleteShare,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['shares'] });
      void queryClient.invalidateQueries({ queryKey: ['outputs'] });
      setDeleting(undefined);
      toast.success(t('common.delete'));
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        title={t('shares.title')}
        description={t('shares.summary', { count: shares.data?.length ?? 0 })}
        action={
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4 mr-1" />
            <span>{t('shares.new')}</span>
          </Button>
        }
      />

      {shares.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-28 w-full rounded-xl" />
        </div>
      ) : shares.data?.length ? (
        <div className="space-y-3">
          {shares.data.map((share) => (
            <Card key={share.id}>
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
                <CardTitle className="flex min-w-0 items-center gap-2 text-base">
                  <span className="truncate">{share.targetName}</span>
                  <Badge variant="secondary" className="shrink-0 text-xs font-normal">
                    {t(`shares.${share.kind}`)}
                  </Badge>
                </CardTitle>
                <div className="flex shrink-0 items-center gap-0.5">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t('outputs.editNote')}
                    onClick={() => setEditing(share)}
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-destructive hover:text-destructive"
                    aria-label={t('common.delete')}
                    onClick={() => setDeleting(share)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <div className="flex min-w-0 flex-1 items-center gap-2 rounded-md border bg-muted/30 px-3 py-2">
                    <Link2 className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate font-mono text-xs text-foreground">
                      {window.location.origin}
                      {share.url}
                    </span>
                  </div>
                  <CopySubscription
                    url={share.url}
                    defaultTarget={share.defaultTarget}
                    showLabel
                    className="w-full sm:w-auto"
                  />
                </div>

                <div className="truncate text-sm font-medium">
                  {share.note || (
                    <span className="font-normal text-muted-foreground">{t('outputs.noNote')}</span>
                  )}
                </div>

                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
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
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="flex flex-1 flex-col items-center justify-center py-12 text-center">
          <Share2 className="size-8 text-muted-foreground/50" />
          <p className="mt-3 text-sm text-muted-foreground">{t('shares.empty')}</p>
        </Card>
      )}

      <CreateShareDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        sources={sources.data ?? []}
        outputs={outputs.data ?? []}
        pending={createShare.isPending}
        onCreate={(body) => createShare.mutate(body)}
      />

      <EditNoteDialog
        share={editing}
        onClose={() => setEditing(undefined)}
        pending={updateNote.isPending}
        onSave={(note) => {
          if (editing) updateNote.mutate({ id: editing.id, note });
        }}
      />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(undefined)}
        title={t('outputs.revoke')}
        onConfirm={() => {
          if (deleting) removeShare.mutate(deleting.id);
        }}
      />
    </div>
  );
}

function CreateShareDialog({
  open,
  onOpenChange,
  sources,
  outputs,
  pending,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sources: SourceDto[];
  outputs: OutputDto[];
  pending: boolean;
  onCreate: (body: ShareBody) => void;
}) {
  const { t } = useTranslation();
  const [kind, setKind] = useState<ShareTargetKind>('source');
  const [targetId, setTargetId] = useState('');
  const [note, setNote] = useState('');
  const [expiresInDays, setExpiresInDays] = useState('0');
  const [maxUses, setMaxUses] = useState('0');

  useEffect(() => {
    if (!open) return;
    setKind('source');
    setTargetId('');
    setNote('');
    setExpiresInDays('0');
    setMaxUses('0');
  }, [open]);

  const targets = kind === 'source' ? sources : outputs;
  const valid = Number.isInteger(Number(targetId)) && Number(targetId) > 0;

  function handleSubmit() {
    if (!valid) return;
    onCreate({
      kind,
      targetId: Number(targetId),
      note: note.trim(),
      expiresInDays: Number.parseInt(expiresInDays, 10) || 0,
      maxUses: Number.parseInt(maxUses, 10) || 0,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('shares.new')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{t('shares.kind')}</Label>
              <Select
                value={kind}
                onValueChange={(value) => {
                  setKind(value as ShareTargetKind);
                  setTargetId('');
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="source">{t('shares.source')}</SelectItem>
                  <SelectItem value="output">{t('shares.output')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{t('shares.target')}</Label>
              <Select value={targetId} onValueChange={setTargetId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t('shares.selectTarget')} />
                </SelectTrigger>
                <SelectContent>
                  {targets.map((item) => (
                    <SelectItem key={item.id} value={`${item.id}`}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="share-note" className="text-xs text-muted-foreground">
              {t('shares.note')}
            </Label>
            <Input
              id="share-note"
              maxLength={200}
              placeholder={t('shares.notePlaceholder')}
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{t('shares.expiresInDays')}</Label>
              <Input
                type="number"
                inputMode="numeric"
                value={expiresInDays}
                onChange={(event) => setExpiresInDays(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{t('shares.maxUses')}</Label>
              <Input
                type="number"
                inputMode="numeric"
                value={maxUses}
                onChange={(event) => setMaxUses(event.target.value)}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button disabled={!valid || pending} onClick={handleSubmit}>
            {pending ? (
              <Loader2 className="size-4 mr-1 animate-spin" />
            ) : (
              <Plus className="size-4 mr-1" />
            )}
            {t('shares.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('outputs.editNote')}</DialogTitle>
        </DialogHeader>
        <div className="py-2">
          <Input
            value={note}
            maxLength={200}
            placeholder={t('shares.notePlaceholder')}
            onChange={(event) => setNote(event.target.value)}
          />
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button disabled={pending} onClick={() => onSave(note.trim())}>
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
