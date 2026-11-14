import type { ProxyType } from '@subhub/shared';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const PROTOCOL_STYLES: Record<ProxyType, string> = {
  vless: 'border-info/30 bg-info/10 text-info',
  trojan: 'border-primary/25 bg-primary/8 text-foreground',
  ss: 'border-success/30 bg-success/10 text-success',
  vmess: 'border-info/25 bg-info/10 text-info',
  hysteria2: 'border-warning/35 bg-warning/12 text-warning',
  tuic: 'border-info/30 bg-info/10 text-info',
  anytls: 'border-success/25 bg-success/10 text-success',
  wireguard: 'border-destructive/30 bg-destructive/10 text-destructive',
  snell: 'border-warning/30 bg-warning/10 text-warning',
  tailscale: 'border-border bg-secondary text-secondary-foreground',
  http: 'border-border bg-muted text-muted-foreground',
  socks5: 'border-border bg-muted text-muted-foreground',
};

export function ProtocolBadge({
  type,
  className,
}: {
  type: ProxyType;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'shrink-0 font-mono text-[10px] uppercase font-semibold tracking-wide',
        PROTOCOL_STYLES[type] ?? '',
        className,
      )}
    >
      {type}
    </Badge>
  );
}
