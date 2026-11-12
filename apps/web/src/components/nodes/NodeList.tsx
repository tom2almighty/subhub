import type { ProxyType } from '@subhub/shared';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export interface NodeListItem {
  name: string;
  type: ProxyType;
  server: string;
  port: number;
}

export function NodeList({ nodes, className }: { nodes: NodeListItem[]; className?: string }) {
  return (
    <ul className={cn('grid grid-cols-1 gap-2 @md:grid-cols-2 @3xl:grid-cols-3', className)}>
      {nodes.map((node) => (
        <li
          key={`${node.type}-${node.server}-${node.port}-${node.name}`}
          className="flex min-w-0 items-center gap-2 rounded-md border border-border/60 bg-muted/20 px-3 py-2 transition-colors hover:bg-muted/50"
        >
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{node.name}</div>
            <div className="mt-0.5 truncate font-mono text-xs tabular-nums text-muted-foreground">
              {node.server}:{node.port}
            </div>
          </div>
          <Badge
            variant="outline"
            className="shrink-0 font-mono text-xs uppercase tracking-wide text-muted-foreground"
          >
            {node.type}
          </Badge>
        </li>
      ))}
    </ul>
  );
}
