import { TARGET_LABELS, TARGETS, type Target } from '@subhub/shared';
import { Check, ChevronDown, Copy } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

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

  async function copy(target: Target) {
    const path = target === defaultTarget ? url : `${url}?target=${target}`;
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
            <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <Copy className="size-3.5" />
          )}
          {showLabel ? <span>{t('outputs.copyUrl')}</span> : null}
          {showLabel ? (
            <ChevronDown className="size-3 text-muted-foreground transition-transform" />
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52 p-1.5 shadow-lg">
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
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
