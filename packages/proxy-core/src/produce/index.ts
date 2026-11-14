import type { DroppedNodeInfo, ProxyNode, Target } from '@subhub/shared';
import { stringify as stringifyYaml } from 'yaml';
import { toEgernObject } from './egern.js';
import { produceLoonProxy } from './loon.js';
import { produceJson, toMihomoObject } from './mihomo.js';
import { produceQxProxy } from './qx.js';
import { produceSingboxOutbound } from './singbox.js';
import { produceSurgeProxy } from './surge.js';
import { produceUri } from './uri.js';

export interface ProduceResult {
  content: string;
  warnings: string[];
  dropped: DroppedNodeInfo[];
}

function collect(
  nodes: ProxyNode[],
  produceOne: (node: ProxyNode) => string,
): { lines: string[]; warnings: string[]; dropped: DroppedNodeInfo[] } {
  const lines: string[] = [];
  const warnings: string[] = [];
  const dropped: DroppedNodeInfo[] = [];
  for (const node of nodes) {
    try {
      const line = produceOne(node);
      if (line) {
        lines.push(line);
      } else {
        const reason = 'Empty output';
        warnings.push(`${node.name}: ${reason}`);
        dropped.push({ name: node.name, type: node.type, reason });
      }
    } catch (error) {
      const reason = (error as Error).message;
      warnings.push(`${node.name}: ${reason}`);
      dropped.push({ name: node.name, type: node.type, reason });
    }
  }
  return { lines, warnings, dropped };
}

export function produce(nodes: ProxyNode[], target: Target): ProduceResult {
  switch (target) {
    case 'uri':
    case 'shadowrocket': {
      const { lines, warnings, dropped } = collect(nodes, produceUri);
      return { content: lines.join('\n'), warnings, dropped };
    }
    case 'surge': {
      const { lines, warnings, dropped } = collect(nodes, produceSurgeProxy);
      return { content: lines.join('\n'), warnings, dropped };
    }
    case 'loon': {
      const { lines, warnings, dropped } = collect(nodes, produceLoonProxy);
      return { content: lines.join('\n'), warnings, dropped };
    }
    case 'qx': {
      const { lines, warnings, dropped } = collect(nodes, produceQxProxy);
      return { content: lines.join('\n'), warnings, dropped };
    }
    case 'mihomo':
    case 'stash':
    case 'egern': {
      const warnings: string[] = [];
      const dropped: DroppedNodeInfo[] = [];
      const proxies: Record<string, unknown>[] = [];
      const mapper = target === 'egern' ? toEgernObject : toMihomoObject;
      for (const node of nodes) {
        try {
          proxies.push(mapper(node));
        } catch (error) {
          const reason = (error as Error).message;
          warnings.push(`${node.name}: ${reason}`);
          dropped.push({ name: node.name, type: node.type, reason });
        }
      }
      return {
        content: stringifyYaml({ proxies }),
        warnings,
        dropped,
      };
    }
    case 'singbox': {
      const warnings: string[] = [];
      const dropped: DroppedNodeInfo[] = [];
      const outbounds: Record<string, unknown>[] = [];
      for (const node of nodes) {
        try {
          outbounds.push(produceSingboxOutbound(node));
        } catch (error) {
          const reason = (error as Error).message;
          warnings.push(`${node.name}: ${reason}`);
          dropped.push({ name: node.name, type: node.type, reason });
        }
      }
      outbounds.push({ type: 'direct', tag: 'direct' });
      return { content: JSON.stringify({ outbounds }, null, 2), warnings, dropped };
    }
    case 'json': {
      const warnings: string[] = [];
      const dropped: DroppedNodeInfo[] = [];
      const values: unknown[] = [];
      for (const node of nodes) {
        try {
          values.push(JSON.parse(produceJson([node]))[0]);
        } catch (error) {
          const reason = (error as Error).message;
          warnings.push(`${node.name}: ${reason}`);
          dropped.push({ name: node.name, type: node.type, reason });
        }
      }
      return { content: JSON.stringify(values, null, 2), warnings, dropped };
    }
    default:
      throw new Error(`Unsupported target ${target satisfies never}`);
  }
}
