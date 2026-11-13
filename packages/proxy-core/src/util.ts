export function safeDecode(value: string | undefined): string | undefined {
  if (value == null) return undefined;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function decodeBase64(value: string): string {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/').replace(/\s+/g, '');
  return Buffer.from(normalized, 'base64').toString('utf8');
}

export function encodeBase64(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64');
}

export function maybeBase64Decode(value: string): string | null {
  const compact = value.replace(/\s+/g, '');
  if (compact.length < 8) return null;
  if (!/^[A-Za-z0-9+/=_-]+$/.test(compact)) return null;
  try {
    const decoded = decodeBase64(compact);
    if (decoded.includes('://') || decoded.includes('proxies:') || decoded.includes('outbounds:')) {
      return decoded;
    }
  } catch {
    return null;
  }
  return null;
}

export function splitFragment(raw: string): { body: string; name?: string } {
  const index = raw.indexOf('#');
  if (index < 0) return { body: raw };
  return {
    body: raw.slice(0, index),
    name: safeDecode(raw.slice(index + 1)),
  };
}

export function parseQuery(query: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const part of query.split('&')) {
    if (!part) continue;
    const index = part.indexOf('=');
    const key = index < 0 ? part : part.slice(0, index);
    const value = index < 0 ? '' : part.slice(index + 1).replace(/\+/g, ' ');
    result[safeDecode(key) ?? key] = safeDecode(value) ?? value;
  }
  return result;
}

export function splitHostPort(value: string): { host: string; port: number } | null {
  let host = value.trim();
  let portText = '';
  const ipv6 = /^\[([^\]]+)\](?::(\d+))?$/.exec(host);
  if (ipv6) {
    host = ipv6[1] ?? '';
    portText = ipv6[2] ?? '';
  } else {
    const index = host.lastIndexOf(':');
    if (index < 0) return null;
    portText = host.slice(index + 1);
    host = host.slice(0, index);
  }
  const port = Number.parseInt(portText, 10);
  if (!host || !Number.isInteger(port) || port <= 0 || port > 65535) return null;
  return { host, port };
}

export function parseBool(value: unknown, fallback?: boolean): boolean | undefined {
  if (value === true || value === 1 || value === '1' || value === 'true') return true;
  if (value === false || value === 0 || value === '0' || value === 'false') return false;
  return fallback;
}

export function splitList(value: unknown): string[] | undefined {
  if (value == null) return undefined;
  const items = (Array.isArray(value) ? value : `${value}`.split(','))
    .map((item) => `${item}`.trim())
    .filter(Boolean);
  return items.length > 0 ? items : undefined;
}

export function parseIntOrUndefined(value: unknown): number | undefined {
  if (value == null || value === '') return undefined;
  const parsed = Number.parseInt(`${value}`, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function cleanHost(host: string): string {
  return host.replace(/^\[/, '').replace(/\]$/, '');
}

export function formatHost(host: string): string {
  return host.includes(':') && !host.startsWith('[') ? `[${host}]` : host;
}

export function firstHeaderValue(
  headers: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  if (!headers) return undefined;
  const match = Object.entries(headers).find(([name]) => name.toLowerCase() === key.toLowerCase());
  if (!match) return undefined;
  const value = match[1];
  if (Array.isArray(value)) return `${value[0] ?? ''}` || undefined;
  return `${value}` || undefined;
}
