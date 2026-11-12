import { Check, Copy } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

export function CopyButton({
  value,
  label,
  size = 'sm',
  variant = 'outline',
}: {
  value: string;
  label?: string;
  size?: 'sm' | 'default' | 'icon';
  variant?: 'outline' | 'ghost' | 'secondary' | 'default';
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success(t('common.copied'));
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error(t('common.copy'));
    }
  }

  return (
    <Button type="button" size={size} variant={variant} onClick={() => void copy()}>
      {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
      {size === 'icon' ? null : <span>{label ?? t('common.copy')}</span>}
    </Button>
  );
}
