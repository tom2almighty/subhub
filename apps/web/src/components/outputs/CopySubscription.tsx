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
  variant?: 'ghost' | 'outline';
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
          className={cn(showLabel && 'gap-1.5', className)}
          aria-label={t('outputs.copyUrl')}
          title={showLabel ? undefined : t('outputs.copyUrl')}
        >
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          {showLabel ? <span>{t('outputs.copyUrl')}</span> : null}
          {showLabel ? <ChevronDown className="size-3.5 text-muted-foreground" /> : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-auto">
        <DropdownMenuLabel>{t('outputs.platform')}</DropdownMenuLabel>
        {TARGETS.map((target) => (
          <DropdownMenuItem key={target} onSelect={() => void copy(target)}>
            <span className="whitespace-nowrap">{TARGET_LABELS[target]}</span>
            {target === defaultTarget ? <Check className="ml-auto size-4" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
