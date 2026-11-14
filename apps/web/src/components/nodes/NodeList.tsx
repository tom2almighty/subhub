import type { PreviewNode, ProxyType } from '@subhub/shared';
import { Lock, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { NodeDetailDrawer } from '@/components/nodes/NodeDetailDrawer';
import { ProtocolBadge } from '@/components/nodes/ProtocolBadge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';

export type NodeListItem = PreviewNode;

function endpoint(node: NodeListItem): string {
  if (node.server) return `${node.server}:${node.port ?? ''}`;
  return node.hostname ?? node['control-url'] ?? 'tailscale';
}

export function ProtocolFilterBar({
  nodes,
  selected,
  onSelect,
  allLabel,
}: {
  nodes: { type: ProxyType }[];
  selected: ProxyType | 'all';
  onSelect: (type: ProxyType | 'all') => void;
  allLabel: string;
}) {
  const counts = new Map<ProxyType, number>();
  for (const node of nodes) {
    counts.set(node.type, (counts.get(node.type) ?? 0) + 1);
  }
  if (counts.size <= 1) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        onClick={() => onSelect('all')}
        className={cn(
          'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
          selected === 'all'
            ? 'border-primary bg-primary text-primary-foreground'
            : 'border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground',
        )}
      >
        <span>{allLabel}</span>
        <span className="font-mono text-[10px] opacity-80">{nodes.length}</span>
      </button>
      {Array.from(counts.entries()).map(([type, count]) => (
        <button
          key={type}
          type="button"
          onClick={() => onSelect(type === selected ? 'all' : type)}
          className={cn(
            'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors',
            selected === type
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground',
          )}
        >
          <span className="font-mono uppercase text-[10px]">{type}</span>
          <span className="font-mono text-[10px] opacity-80">{count}</span>
        </button>
      ))}
    </div>
  );
}

export function NodeList({
  nodes,
  className,
  columns,
  selectable,
  selectedIndices,
  onToggleSelect,
  onEditNode,
  onDeleteNode,
}: {
  nodes: NodeListItem[];
  className?: string;
  columns?: 1 | 2 | 3;
  selectable?: boolean;
  selectedIndices?: Set<number>;
  onToggleSelect?: (index: number) => void;
  onEditNode?: (index: number, node: NodeListItem) => void;
  onDeleteNode?: (index: number, node: NodeListItem) => void;
}) {
  const [inspecting, setInspecting] = useState<NodeListItem | null>(null);

  const gridColsClass =
    columns === 1
      ? 'grid-cols-1'
      : columns === 2
        ? 'grid-cols-1 sm:grid-cols-2'
        : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3';

  return (
    <>
      <ul className={cn('grid content-start gap-2', gridColsClass, className)}>
        {nodes.map((node, index) => (
          <li key={`${node.type}-${endpoint(node)}-${node.name}-${index}`}>
            <div
              className={cn(
                'group flex w-full min-w-0 items-start justify-between gap-2 rounded-lg border border-border bg-card p-3 text-xs transition-all hover:border-primary/40 hover:bg-accent/40 hover:shadow-xs',
                selectedIndices?.has(index) && 'border-primary/60 bg-primary/5',
              )}
            >
              {selectable ? (
                <div className="pt-0.5 shrink-0">
                  <Checkbox
                    checked={selectedIndices?.has(index) ?? false}
                    onCheckedChange={() => onToggleSelect?.(index)}
                  />
                </div>
              ) : null}
              <button
                type="button"
                onClick={() => setInspecting(node)}
                className="min-w-0 flex-1 space-y-1 text-left focus-visible:outline-none"
              >
                <div className="break-words text-xs sm:text-sm font-medium text-foreground leading-snug group-hover:text-primary transition-colors">
                  {node.name}
                </div>
                <div className="flex flex-wrap items-center gap-1.5 font-mono text-[11px] tabular-nums text-muted-foreground">
                  <span className="break-all">{endpoint(node)}</span>
                  {node.network ? (
                    <span className="rounded bg-muted px-1 py-0.2 text-[10px] uppercase">
                      {node.network}
                    </span>
                  ) : null}
                  {node.tls ? (
                    <span className="inline-flex items-center gap-0.5 rounded bg-muted px-1 py-0.2 text-[10px]">
                      <Lock className="size-2.5" />
                      TLS
                    </span>
                  ) : null}
                  {node.sourceName ? (
                    <span className="rounded bg-secondary px-1.5 py-0.2 font-sans text-[10px] text-secondary-foreground">
                      {node.sourceName}
                    </span>
                  ) : null}
                </div>
              </button>
              <div className="flex shrink-0 items-center gap-1">
                <ProtocolBadge type={node.type} />
                {onEditNode ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="size-7 text-muted-foreground hover:text-foreground"
                    onClick={() => onEditNode(index, node)}
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                ) : null}
                {onDeleteNode ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="size-7 text-muted-foreground hover:text-destructive"
                    onClick={() => onDeleteNode(index, node)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                ) : null}
              </div>
            </div>
          </li>
        ))}
      </ul>
      <NodeDetailDrawer node={inspecting} onClose={() => setInspecting(null)} />
    </>
  );
}
