import { TARGET_LABELS, TARGETS, type Target } from '@subhub/shared';
import { Check, Copy } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { buildSubscriptionPath } from '@/components/outputs/CopySubscription';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { generateQrMatrix } from '@/lib/qrcode';

export function QrCodeDialog({
  open,
  onOpenChange,
  url,
  defaultTarget,
  download = true,
  title,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  url: string;
  defaultTarget: Target;
  download?: boolean;
  title?: string;
}) {
  const { t } = useTranslation();
  const [target, setTarget] = useState<Target>(defaultTarget);
  const [copied, setCopied] = useState(false);

  const fullUrl = useMemo(() => {
    const path = buildSubscriptionPath(url, target, defaultTarget, download);
    return `${window.location.origin}${path}`;
  }, [url, target, defaultTarget, download]);

  const qr = useMemo(() => {
    try {
      return generateQrMatrix(fullUrl);
    } catch {
      return null;
    }
  }, [fullUrl]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      toast.success(t('common.copied'));
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error(t('common.copy'));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden sm:max-w-sm">
        <DialogHeader className="min-w-0">
          <DialogTitle>{title ?? t('outputs.qrTitle')}</DialogTitle>
          <DialogDescription>{t('outputs.qrHint')}</DialogDescription>
        </DialogHeader>
        <div className="min-w-0 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <span className="shrink-0 text-xs font-medium text-muted-foreground">
              {t('outputs.platform')}
            </span>
            <Select value={target} onValueChange={(value) => setTarget(value as Target)}>
              <SelectTrigger className="h-8 w-44 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TARGETS.map((item) => (
                  <SelectItem key={item} value={item}>
                    {TARGET_LABELS[item]}
                    {item === defaultTarget ? ` (${t('common.default', '默认')})` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-center rounded-xl border border-border bg-white p-4 shadow-xs">
            {qr ? (
              <svg
                viewBox={`0 0 ${qr.length} ${qr.length}`}
                className="aspect-square w-full max-w-48 shape-rendering-crispEdges"
                role="img"
                aria-label={fullUrl}
              >
                <rect width={qr.length} height={qr.length} fill="#ffffff" />
                <path
                  d={qr
                    .map((row, r) =>
                      row.map((cell, c) => (cell ? `M${c} ${r}h1v1h-1z` : '')).join(''),
                    )
                    .join('')}
                  fill="#09090b"
                />
              </svg>
            ) : (
              <div className="flex aspect-square w-full max-w-48 items-center justify-center text-xs text-muted-foreground">
                {t('outputs.qrTooLong')}
              </div>
            )}
          </div>

          <div className="flex w-full min-w-0 items-center gap-2 overflow-hidden rounded-lg border border-border bg-muted/40 p-2">
            <code className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground">
              {fullUrl}
            </code>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="shrink-0"
              onClick={() => void handleCopy()}
            >
              {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
              <span className="ml-1 text-xs">{t('common.copy')}</span>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
