import {
  type ShareDto,
  type ShareTargetKind,
  TARGET_LABELS,
  TARGETS,
  type Target,
} from '@subhub/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link2, Loader2, Plus, Share2, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { CopySubscription } from '@/components/outputs/CopySubscription';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/format';

export function TargetSharePanel({ kind, targetId }: { kind: ShareTargetKind; targetId: number }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [expiresInDays, setExpiresInDays] = useState('0');
  const [maxUses, setMaxUses] = useState('0');
  const [allowedTargets, setAllowedTargets] = useState<Target[]>([]);

  const shares = useQuery({ queryKey: ['shares'], queryFn: api.listShares });
  const items = (shares.data ?? []).filter(
    (item) => item.kind === kind && item.targetId === targetId,
  );

  const createShare = useMutation({
    mutationFn: () =>
      api.createShare({
        kind,
        targetId,
        note,
        expiresInDays: Number(expiresInDays) || 0,
        maxUses: Number(maxUses) || 0,
        enabled: true,
        allowedTargets,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['shares'] });
      void queryClient.invalidateQueries({ queryKey: ['outputs'] });
      setOpen(false);
      setNote('');
      setExpiresInDays('0');
      setMaxUses('0');
      setAllowedTargets([]);
      toast.success(t('shares.create'));
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const toggleShare = useMutation({
    mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) =>
      api.updateShare(id, { enabled }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['shares'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const removeShare = useMutation({
    mutationFn: api.deleteShare,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['shares'] });
      void queryClient.invalidateQueries({ queryKey: ['outputs'] });
      toast.success(t('common.delete'));
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <Share2 className="size-4 text-muted-foreground" />
          <span>{t('outputs.shares')}</span>
          <Badge variant="secondary" className="text-xs font-normal tabular-nums">
            {items.length}
          </Badge>
        </CardTitle>
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          <Plus className="mr-1 size-3.5" />
          <span>{t('shares.new')}</span>
        </Button>
      </CardHeader>
      <CardContent className="space-y-2.5">
        {items.length === 0 ? (
          <p className="py-4 text-center text-xs text-muted-foreground">
            {t('outputs.sharesEmpty')}
          </p>
        ) : (
          items.map((share: ShareDto) => (
            <div
              key={share.id}
              className="flex flex-col gap-2 rounded-lg border border-border bg-muted/20 p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <Link2 className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate font-mono text-xs text-foreground">
                    {share.note || share.url}
                  </span>
                  {share.allowedTargets.length > 0 ? (
                    <Badge variant="outline" className="text-[10px]">
                      {share.allowedTargets.map((tgt) => TARGET_LABELS[tgt]).join(', ')}
                    </Badge>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                  <span>
                    {share.usedCount}/{share.maxUses || '∞'}
                  </span>
                  <span>
                    {share.expiresAt ? formatDate(share.expiresAt) : t('common.unlimited')}
                  </span>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <Switch
                  checked={share.enabled}
                  onCheckedChange={(checked) =>
                    toggleShare.mutate({ id: share.id, enabled: checked })
                  }
                  aria-label={t('common.enabled')}
                />
                <CopySubscription
                  url={share.url}
                  defaultTarget={
                    share.allowedTargets.length === 1
                      ? (share.allowedTargets[0] ?? share.defaultTarget)
                      : share.defaultTarget
                  }
                  variant="ghost"
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => removeShare.mutate(share.id)}
                  aria-label={t('common.delete')}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </div>
          ))
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('shares.new')}</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              createShare.mutate();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="quick-share-note">{t('shares.note')}</Label>
              <Input
                id="quick-share-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t('shares.notePlaceholder')}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="quick-share-days">{t('shares.expiresInDays')}</Label>
                <Input
                  id="quick-share-days"
                  type="number"
                  min={0}
                  value={expiresInDays}
                  onChange={(e) => setExpiresInDays(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="quick-share-uses">{t('shares.maxUses')}</Label>
                <Input
                  id="quick-share-uses"
                  type="number"
                  min={0}
                  value={maxUses}
                  onChange={(e) => setMaxUses(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">{t('shares.allowedTargets')}</Label>
              <div className="flex flex-wrap gap-2.5 rounded-md border p-2.5">
                {TARGETS.map((tgt) => (
                  <div key={tgt} className="flex items-center gap-1.5 text-xs">
                    <Checkbox
                      id={`share-target-${tgt}`}
                      checked={allowedTargets.includes(tgt)}
                      onCheckedChange={(checked) => {
                        setAllowedTargets((prev) =>
                          checked === true ? [...prev, tgt] : prev.filter((item) => item !== tgt),
                        );
                      }}
                    />
                    <Label
                      htmlFor={`share-target-${tgt}`}
                      className="cursor-pointer font-normal text-xs"
                    >
                      {TARGET_LABELS[tgt]}
                    </Label>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">{t('shares.allowedTargetsHint')}</p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={createShare.isPending}>
                {createShare.isPending ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : null}
                {t('shares.create')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
