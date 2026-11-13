import type { ProxyType } from '@subhub/shared';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export interface NodeListItem {
  name: string;
  type: ProxyType;
  server: string;
  port: number;
}

export function NodeList({
  nodes,
  className,
  columns,
}: {
  nodes: NodeListItem[];
  className?: string;
  columns?: 1 | 2 | 3;
}) {
  const gridColsClass =
    columns === 1
      ? 'grid-cols-1'
      : columns === 2
        ? 'grid-cols-1 sm:grid-cols-2'
        : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3';

  return (
    <ul className={cn('grid gap-2', gridColsClass, className)}>
      {nodes.map((node) => (
        <li
          key={`${node.type}-${node.server}-${node.port}-${node.name}`}
          className="flex min-w-0 items-start justify-between gap-2.5 rounded-lg border border-border bg-card p-2.5 text-xs transition-colors hover:border-foreground/20 hover:bg-accent/40"
        >
          <div className="min-w-0 flex-1 space-y-1">
            <div className="break-words text-xs sm:text-sm font-medium text-foreground leading-snug">
              {node.name}
            </div>
            <div className="break-all font-mono text-[11px] tabular-nums text-muted-foreground">
              {node.server}:{node.port}
            </div>
          </div>
          <Badge
            variant="secondary"
            className="shrink-0 font-mono text-[10px] uppercase font-semibold text-muted-foreground"
          >
            {node.type}
          </Badge>
        </li>
      ))}
    </ul>
  );
}
