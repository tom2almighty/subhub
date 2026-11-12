import { parseNodes } from '@subhub/proxy-core';
import type { FlowInfo, ProxyNode } from '@subhub/shared';
import { fetch, ProxyAgent } from 'undici';
import type { SourceRow } from '../db/schema.js';
import { env } from '../env.js';
import { parseFlowHeader } from './flow.js';

const MAX_BODY_BYTES = 20 * 1024 * 1024;

export interface FetchResult {
  raw: string;
  nodes: ProxyNode[];
  warnings: string[];
  flow: FlowInfo | null;
  etag: string | null;
  lastModified: string | null;
  notModified: boolean;
}

function buildHeaders(source: SourceRow): Record<string, string> {
  const headers: Record<string, string> = {
    'user-agent': source.userAgent || env.defaultUserAgent,
    accept: '*/*',
  };
  for (const [key, value] of Object.entries(source.headers ?? {})) {
    if (!key || key.toLowerCase() === 'host') continue;
    headers[key] = value;
  }
  return headers;
}

function buildDispatcher(source: SourceRow): ProxyAgent | undefined {
  if (!source.proxy) return undefined;
  if (!/^https?:\/\//i.test(source.proxy)) {
    throw new Error('Only HTTP(S) proxies are supported for source fetching');
  }
  return new ProxyAgent(source.proxy);
}

function flowNumber(value: unknown): number | undefined {
  const number =
    typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  return Number.isFinite(number) ? number : undefined;
}

export function parseFlowJson(value: unknown): FlowInfo | null {
  if (!value || typeof value !== 'object') return null;
  const root = value as Record<string, unknown>;
  const source =
    root.data && typeof root.data === 'object' ? (root.data as Record<string, unknown>) : root;
  const result: FlowInfo = {};
  const upload = flowNumber(source.upload);
  const download = flowNumber(source.download);
  const total = flowNumber(source.total);
  const expire = flowNumber(source.expire);
  if (upload !== undefined) result.upload = upload;
  if (download !== undefined) result.download = download;
  if (total !== undefined) result.total = total;
  if (expire !== undefined) result.expire = expire;
  return Object.keys(result).length > 0 ? result : null;
}

export async function fetchFlow(source: SourceRow): Promise<FlowInfo | null> {
  if (!source.flowUrl) return null;
  const response = await fetch(source.flowUrl, {
    headers: buildHeaders(source),
    dispatcher: buildDispatcher(source),
    redirect: 'follow',
    signal: AbortSignal.timeout(env.fetchTimeoutMs),
  });
  if (!response.ok) throw new Error(`Traffic URL returned HTTP ${response.status}`);
  const headerFlow = parseFlowHeader(response.headers.get('subscription-userinfo') ?? undefined);
  if (headerFlow) return headerFlow;
  const text = await response.text();
  try {
    return parseFlowJson(JSON.parse(text));
  } catch {
    throw new Error('Traffic URL returned no usable data');
  }
}

export async function fetchSubscription(
  source: SourceRow,
  options: { force?: boolean } = {},
): Promise<FetchResult> {
  if (!source.url) throw new Error('Remote source URL is empty');
  const headers = buildHeaders(source);
  if (!options.force && source.etag) headers['if-none-match'] = source.etag;
  if (!options.force && source.lastModified) headers['if-modified-since'] = source.lastModified;
  const dispatcher = buildDispatcher(source);

  let response: Awaited<ReturnType<typeof fetch>>;
  try {
    response = await fetch(source.url, {
      headers,
      dispatcher,
      redirect: 'follow',
      signal: AbortSignal.timeout(env.fetchTimeoutMs),
    });
  } finally {
    // The dispatcher owns sockets; closing it after the response body is read
    // is handled by undici's default pool teardown at process exit.
  }

  if (response.status === 304) {
    return {
      raw: source.raw,
      nodes: source.nodes,
      warnings: source.warnings,
      flow: source.flow ?? null,
      etag: source.etag,
      lastModified: source.lastModified,
      notModified: true,
    };
  }
  if (!response.ok) {
    throw new Error(`Subscription returned HTTP ${response.status}`);
  }
  const contentLength = Number.parseInt(response.headers.get('content-length') ?? '0', 10);
  if (contentLength > MAX_BODY_BYTES) {
    throw new Error('Subscription is larger than 20 MB');
  }
  const raw = await response.text();
  if (Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) {
    throw new Error('Subscription is larger than 20 MB');
  }
  if (/^<!doctype html/i.test(raw.trimStart())) {
    throw new Error('Subscription returned an HTML page instead of nodes');
  }

  const parsed = parseNodes(raw);
  return {
    raw,
    nodes: parsed.nodes,
    warnings: parsed.warnings,
    flow: parseFlowHeader(response.headers.get('subscription-userinfo') ?? undefined),
    etag: response.headers.get('etag'),
    lastModified: response.headers.get('last-modified'),
    notModified: false,
  };
}
