import type { ProxyNode } from '@subhub/shared';
import { parse as parseYaml } from 'yaml';
import { maybeBase64Decode } from '../util.js';
import { looksLikeStructured, parseStructured } from './clash.js';
import { parseUri } from './uri.js';

export interface ParseResult {
  nodes: ProxyNode[];
  warnings: string[];
}

function parseStructuredText(text: string): ParseResult {
  const trimmed = text.trim();
  let value: unknown;
  try {
    value = JSON.parse(trimmed);
  } catch {
    value = parseYaml(trimmed);
  }
  const result = parseStructured(value);
  return { nodes: result.nodes, warnings: result.warnings };
}

export function parseNodes(input: string, depth = 0): ParseResult {
  const text = input.replace(/^﻿/, '').replace(/\r\n?/g, '\n').trim();
  if (!text) return { nodes: [], warnings: [] };

  if (depth < 2) {
    const decoded = maybeBase64Decode(text);
    if (decoded) {
      const result = parseNodes(decoded, depth + 1);
      if (result.nodes.length > 0) return result;
    }
  }

  if (looksLikeStructured(text)) {
    try {
      const result = parseStructuredText(text);
      if (result.nodes.length > 0 || result.warnings.length > 0) return result;
    } catch (error) {
      return {
        nodes: [],
        warnings: [`Failed to parse structured subscription: ${(error as Error).message}`],
      };
    }
  }

  const nodes: ProxyNode[] = [];
  const warnings: string[] = [];
  const lines = text.split('\n');
  for (const [index, rawLine] of lines.entries()) {
    let line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith('//')) continue;
    if (line.startsWith('- ')) line = line.slice(2).trim();
    if (!line.includes('://')) continue;
    try {
      nodes.push(parseUri(line));
    } catch (error) {
      warnings.push(`line ${index + 1}: ${(error as Error).message}`);
    }
  }

  return { nodes, warnings };
}
