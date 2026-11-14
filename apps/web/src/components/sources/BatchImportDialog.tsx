import type { ParseInspectDto, ProxyNode } from '@subhub/shared';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';

export function BatchImportDialog({
  open,
  onOpenChange,
  saving,
  onImport,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  saving?: boolean;
  onImport: (nodes: ProxyNode[], mode: 'append' | 'replace') => void;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [mode, setMode] = useState<'append' | 'replace'>('append');
  const [inspecting, setInspecting] = useState(false);
  const [result, setResult] = useState<ParseInspectDto | null>(null);

  useEffect(() => {
    if (!open) {
      setText('');
      setResult(null);
      return;
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (!text.trim()) {
      setResult(null);
      return;
    }
    const timer = setTimeout(async () => {
      setInspecting(true);
      try {
        const res = await api.inspectParse(text);
        setResult(res);
      } catch {
        setResult(null);
      } finally {
        setInspecting(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [text, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('sources.batchImport')}</DialogTitle>
          <DialogDescription>{t('sources.contentHint')}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Textarea
            rows={7}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="vless://...&#10;ss://...&#10;proxies: ..."
            className="max-h-60 min-h-36 resize-y break-all font-mono text-xs leading-relaxed"
          />

          {inspecting ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
              <span>{t('sources.inspecting')}</span>
            </div>
          ) : result ? (
            <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3 text-xs">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 font-medium">
                  <CheckCircle2 className="size-3.5 text-success" />
                  <span>{t('sources.parsedCount', { count: result.nodes.length })}</span>
                </div>
                <Badge variant="secondary" className="font-mono text-[10px]">
                  {result.format}
                </Badge>
              </div>
              {result.warnings.length > 0 ? (
                <div className="space-y-1 text-warning">
                  <div className="flex items-center gap-1 font-medium">
                    <AlertCircle className="size-3" />
                    <span>{t('outputs.warnings')}</span>
                  </div>
                  <ul className="max-h-20 overflow-y-auto space-y-0.5 pl-4 text-[11px]">
                    {result.warnings.slice(0, 5).map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="flex items-center justify-between gap-2">
            <Label className="text-xs text-muted-foreground">{t('sources.importMode')}</Label>
            <Select value={mode} onValueChange={(v) => setMode(v as 'append' | 'replace')}>
              <SelectTrigger className="h-8 w-40 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="append">{t('sources.importAppend')}</SelectItem>
                <SelectItem value="replace">{t('sources.importReplace')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            {t('common.cancel')}
          </Button>
          <Button
            type="button"
            disabled={saving || !result || result.nodes.length === 0}
            onClick={() => result && onImport(result.nodes, mode)}
          >
            {saving ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : null}
            {t('sources.confirmImport')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
