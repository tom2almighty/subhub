import type { ProxyNode } from '@subhub/shared';
import { parse as parseYaml } from 'yaml';
import { normalizeNodeText } from '../text.js';
import { maybeBase64Decode } from '../util.js';
import { parseStructured } from './mihomo.js';
import { isProxySection, parseProxyLine } from './proxy-line.js';
import { parseUri } from './uri.js';

export interface ParseResult {
  nodes: ProxyNode[];
  warnings: string[];
}

const MAX_LINE_WARNINGS = 20;
const URI_PATTERN = /^[a-z0-9+.-]+:\/\//i;
const COMMENT_PATTERN = /^(#|\/\/|;)/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseStructuredText(text: string): ParseResult | null {
  const trimmed = text.trim();
  let value: unknown;
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      value = JSON.parse(trimmed);
    } catch {
      return null;
    }
  } else {
    try {
      value = parseYaml(trimmed);
    } catch {
      return null;
    }
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return null;
    return parseStructured(value);
  }
  if (!isPlainObject(value)) return null;
  if (!Array.isArray(value.proxies) && !Array.isArray(value.outbounds)) return null;
  return parseStructured(value);
}

function parseLineFormat(text: string): ParseResult {
  const nodes: ProxyNode[] = [];
  const warnings: string[] = [];
  const skipped: number[] = [];
  let section: string | null = null;

  for (const [index, rawLine] of text.split('\n').entries()) {
    const line = rawLine.trim();
    if (!line) continue;

    const header = /^\[([^\]]+)\]$/.exec(line);
    if (header) {
      section = (header[1] ?? '').trim().toLowerCase();
      continue;
    }
    if (COMMENT_PATTERN.test(line)) continue;
    if (section && !isProxySection(section)) continue;

    try {
      if (URI_PATTERN.test(line)) {
        nodes.push(normalizeNodeText(parseUri(line)));
        continue;
      }
      const node = parseProxyLine(line);
      if (node) {
        nodes.push(normalizeNodeText(node));
        continue;
      }
    } catch (error) {
      warnings.push(`line ${index + 1}: ${(error as Error).message}`);
      continue;
    }
    skipped.push(index + 1);
  }

  if (skipped.length > 0) {
    if (nodes.length === 0) {
      warnings.push(
        `Unrecognized subscription format (${skipped.length} lines could not be parsed)`,
      );
      for (const line of skipped.slice(0, MAX_LINE_WARNINGS)) {
        warnings.push(`line ${line}: Unrecognized line`);
      }
    } else {
      warnings.push(`Skipped ${skipped.length} unrecognized lines (first: line ${skipped[0]})`);
    }
  }

  return { nodes, warnings };
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

  const structured = parseStructuredText(text);
  const lines = parseLineFormat(text);

  if (structured) {
    if (structured.nodes.length > 0) return structured;
    if (structured.warnings.length > 0 && lines.nodes.length === 0) return structured;
  }
  return lines;
}
