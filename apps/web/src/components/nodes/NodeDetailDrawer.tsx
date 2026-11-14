import type { PreviewNode } from '@subhub/shared';
import { Check, Copy, Globe, Lock, Network, Shield } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ProtocolBadge } from '@/components/nodes/ProtocolBadge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

function DetailRow({ label, value }: { label: string; value?: string | number | boolean | null }) {
  if (value === undefined || value === null || value === '') return null;
  const display = typeof value === 'boolean' ? (value ? 'true' : 'false') : String(value);
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border/60 py-2.5 text-xs last:border-b-0">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 break-all text-right font-mono font-medium text-foreground">
        {display}
      </span>
    </div>
  );
}

export function NodeDetailDrawer({
  node,
  onClose,
}: {
  node: PreviewNode | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const raw = node?.raw ?? node;
  const jsonText = raw ? JSON.stringify(raw, null, 2) : '';

  async function copyJson() {
    if (!jsonText) return;
    try {
      await navigator.clipboard.writeText(jsonText);
      setCopied(true);
      toast.success(t('common.copied'));
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error(t('common.copy'));
    }
  }

  return (
    <Sheet open={!!node} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        {node ? (
          <>
            <SheetHeader className="border-b border-border px-5 py-4">
              <div className="flex items-center gap-2">
                <ProtocolBadge type={node.type} />
                {node.tls ? (
                  <Badge variant="secondary" className="gap-1 text-[10px]">
                    <Lock className="size-2.5" />
                    TLS
                  </Badge>
                ) : null}
                {node.network ? (
                  <Badge variant="outline" className="gap-1 font-mono text-[10px]">
                    <Network className="size-2.5" />
                    {node.network}
                  </Badge>
                ) : null}
              </div>
              <SheetTitle className="mt-1 break-words text-base leading-snug">
                {node.name}
              </SheetTitle>
              <SheetDescription className="font-mono text-xs tabular-nums">
                {node.server
                  ? `${node.server}:${node.port ?? ''}`
                  : (node.hostname ?? node['control-url'] ?? 'tailscale')}
              </SheetDescription>
            </SheetHeader>

            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
              <section className="space-y-1.5">
                <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <Globe className="size-3.5" />
                  {t('nodes.connection')}
                </h4>
                <div className="rounded-lg border border-border bg-card px-3.5">
                  <DetailRow label={t('processors.type')} value={node.type} />
                  <DetailRow label={t('processors.server')} value={node.server} />
                  <DetailRow label={t('processors.port')} value={node.port} />
                  <DetailRow label="Network" value={node.network} />
                  <DetailRow label="UDP" value={node.udp} />
                  <DetailRow label="Cipher" value={node.cipher} />
                  <DetailRow label="Obfs" value={node.obfs} />
                  <DetailRow label="Ports" value={node.ports} />
                </div>
              </section>

              {node.tls || node.sni || node.servername || node.alpn?.length || node.flow ? (
                <section className="space-y-1.5">
                  <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <Shield className="size-3.5" />
                    {t('nodes.security')}
                  </h4>
                  <div className="rounded-lg border border-border bg-card px-3.5">
                    <DetailRow label="TLS" value={node.tls} />
                    <DetailRow label="SNI" value={node.sni ?? node.servername} />
                    <DetailRow label="Flow" value={node.flow} />
                    <DetailRow label="ALPN" value={node.alpn?.join(', ')} />
                  </div>
                </section>
              ) : null}

              <section className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {t('nodes.rawConfig')}
                  </h4>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 px-2 text-xs"
                    onClick={() => void copyJson()}
                  >
                    {copied ? (
                      <Check className="size-3 text-success" />
                    ) : (
                      <Copy className="size-3" />
                    )}
                    <span>{t('common.copy')}</span>
                  </Button>
                </div>
                <pre className="max-h-64 overflow-auto rounded-lg border border-border bg-muted/40 p-3 font-mono text-[11px] leading-relaxed text-foreground/90">
                  {jsonText}
                </pre>
              </section>
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
