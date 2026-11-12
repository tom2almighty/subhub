import type { ProxyNode, Target } from '@subhub/shared';
import { stringify as stringifyYaml } from 'yaml';
import { produceJson, toClashObject } from './clash.js';
import { produceLoonProxy } from './loon.js';
import { produceQxProxy } from './qx.js';
import { produceSingboxOutbound } from './singbox.js';
import { produceSurgeProxy } from './surge.js';
import { produceUri } from './uri.js';

export interface ProduceResult {
  content: string;
  warnings: string[];
}

function collect(
  nodes: ProxyNode[],
  produceOne: (node: ProxyNode) => string,
): { lines: string[]; warnings: string[] } {
  const lines: string[] = [];
  const warnings: string[] = [];
  for (const node of nodes) {
    try {
      const line = produceOne(node);
      if (line) lines.push(line);
    } catch (error) {
      warnings.push(`${node.name}: ${(error as Error).message}`);
    }
  }
  return { lines, warnings };
}

export function produce(nodes: ProxyNode[], target: Target): ProduceResult {
  switch (target) {
    case 'uri':
    case 'shadowrocket': {
      const { lines, warnings } = collect(nodes, produceUri);
      return { content: lines.join('\n'), warnings };
    }
    case 'surge': {
      const { lines, warnings } = collect(nodes, produceSurgeProxy);
      return { content: lines.join('\n'), warnings };
    }
    case 'loon': {
      const { lines, warnings } = collect(nodes, produceLoonProxy);
      return { content: lines.join('\n'), warnings };
    }
    case 'qx': {
      const { lines, warnings } = collect(nodes, produceQxProxy);
      return { content: lines.join('\n'), warnings };
    }
    case 'mihomo':
    case 'stash': {
      const warnings: string[] = [];
      const proxies: Record<string, unknown>[] = [];
      for (const node of nodes) {
        try {
          proxies.push(toClashObject(node));
        } catch (error) {
          warnings.push(`${node.name}: ${(error as Error).message}`);
        }
      }
      return {
        content: stringifyYaml({ proxies }),
        warnings,
      };
    }
    case 'singbox': {
      const warnings: string[] = [];
      const outbounds: Record<string, unknown>[] = [];
      for (const node of nodes) {
        try {
          outbounds.push(produceSingboxOutbound(node));
        } catch (error) {
          warnings.push(`${node.name}: ${(error as Error).message}`);
        }
      }
      outbounds.push({ type: 'direct', tag: 'direct' });
      return { content: JSON.stringify({ outbounds }, null, 2), warnings };
    }
    case 'json': {
      const warnings: string[] = [];
      const values: unknown[] = [];
      for (const node of nodes) {
        try {
          values.push(JSON.parse(produceJson([node]))[0]);
        } catch (error) {
          warnings.push(`${node.name}: ${(error as Error).message}`);
        }
      }
      return { content: JSON.stringify(values, null, 2), warnings };
    }
    default:
      throw new Error(`Unsupported target ${target satisfies never}`);
  }
}
