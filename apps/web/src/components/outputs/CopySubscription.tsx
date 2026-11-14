import { TARGET_LABELS, TARGETS, type Target } from '@subhub/shared';
import { Check, ChevronDown, Copy, QrCode } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { QrCodeDialog } from '@/components/common/QrCodeDialog';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

const DOWNLOAD_STORAGE_KEY = 'subhub.copy.download';

export function buildSubscriptionPath(
  url: string,
  target: Target,
  defaultTarget: Target,
  download: boolean,
): string {
  const params = new URLSearchParams();
  if (target !== defaultTarget) params.set('target', target);
  if (!download) params.set('download', '0');
  const qs = params.toString();
  return `${url}${qs ? `?${qs}` : ''}`;
}

export function CopySubscription({
  url,
  defaultTarget,
  showLabel = false,
  variant = 'ghost',
  className,
}: {
  url: string;
  defaultTarget: Target;
  showLabel?: boolean;
  variant?: 'ghost' | 'outline' | 'default';
  className?: string;
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [download, setDownload] = useState(() => {
    try {
      return localStorage.getItem(DOWNLOAD_STORAGE_KEY) !== '0';
    } catch {
      return true;
    }
  });

  function toggleDownload(checked: boolean) {
    setDownload(checked);
    try {
      localStorage.setItem(DOWNLOAD_STORAGE_KEY, checked ? '1' : '0');
    } catch {
      // ignore storage errors
    }
  }

  async function copy(target: Target) {
    const path = buildSubscriptionPath(url, target, defaultTarget, download);
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${path}`);
      setCopied(true);
      toast.success(t('common.copied'));
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error(t('common.copy'));
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant={variant}
          size={showLabel ? 'sm' : 'icon-sm'}
          className={cn(showLabel && 'gap-1.5 text-xs sm:text-sm font-medium', className)}
          aria-label={t('outputs.copyUrl')}
          title={showLabel ? undefined : t('outputs.copyUrl')}
        >
          {copied ? (
            <Check className="size-3.5 text-success" />
          ) : (
            <Copy className="size-3.5" />
          )}
          {showLabel ? <span>{t('outputs.copyUrl')}</span> : null}
          {showLabel ? (
            <ChevronDown className="size-3 text-muted-foreground transition-transform" />
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 p-1.5 shadow-lg">
        <div
          className="flex items-center justify-between gap-2 rounded-sm px-2 py-1.5"
          onClick={(e) => e.stopPropagation()}
        >
          <Label
            htmlFor="copy-download-switch"
            className="cursor-pointer text-xs font-normal text-muted-foreground"
          >
            {t('outputs.downloadAttachment')}
          </Label>
          <Switch
            id="copy-download-switch"
            checked={download}
            onCheckedChange={toggleDownload}
          />
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="px-2 py-1.5 text-xs text-muted-foreground font-normal">
          {t('outputs.platform')}
        </DropdownMenuLabel>
        <DropdownMenuItem
          className="flex cursor-pointer items-center justify-between py-2 text-sm font-medium"
          onSelect={() => void copy(defaultTarget)}
        >
          <span>{TARGET_LABELS[defaultTarget]}</span>
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
            {t('common.default', '默认')}
          </span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {TARGETS.filter((item) => item !== defaultTarget).map((target) => (
          <DropdownMenuItem
            key={target}
            className="flex cursor-pointer items-center justify-between py-2 text-sm"
            onSelect={() => void copy(target)}
          >
            <span>{TARGET_LABELS[target]}</span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="flex cursor-pointer items-center gap-2 py-2 text-sm font-medium text-primary focus:text-primary"
          onSelect={() => setQrOpen(true)}
        >
          <QrCode className="size-3.5" />
          <span>{t('outputs.showQr')}</span>
        </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <QrCodeDialog
        open={qrOpen}
        onOpenChange={setQrOpen}
        url={url}
        defaultTarget={defaultTarget}
        download={download}
      />
    </>
  );
}
