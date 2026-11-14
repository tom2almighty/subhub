import type { PluginOptions, ProxyNode, TransportOptions } from '@subhub/shared';

const WRAPPED_QUOTES = /^(["'])([\s\S]*)\1$/;

/**
 * Remove one layer of wrapping quotes from a text field. Exporters often wrap
 * host, path or SNI values in quotes; keeping them would leak into other
 * formats and produce nested quoting.
 */
export function unquoteText(value: string): string {
  const trimmed = `${value}`.trim();
  const match = WRAPPED_QUOTES.exec(trimmed);
  if (!match) return trimmed;
  return (match[2] ?? '').replace(/\\(["'\\])/g, '$1');
}

/** Quote a value for comma-separated config formats, escaping it first. */
export function quoteText(value: string): string {
  const text = unquoteText(value);
  return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

const NEEDS_QUOTES = /[,"\\]|\s/;
const NEEDS_DELIMITER_QUOTES = /[,"\\]/;

/** Quote only when a value would break a comma-separated parameter list. */
export function quoteIfNeeded(value: string): string {
  const text = unquoteText(value);
  return NEEDS_QUOTES.test(text) ? quoteText(text) : text;
}

/**
 * Quote only delimiter-breaking values. Some formats accept spaces unquoted,
 * so quoting less keeps the output closer to what clients emit themselves.
 */
export function quoteIfDelimited(value: string): string {
  const text = unquoteText(value);
  return NEEDS_DELIMITER_QUOTES.test(text) ? quoteText(text) : text;
}

function normalizeHeaders(headers: Record<string, string> | undefined): void {
  if (!headers) return;
  for (const key of Object.keys(headers)) {
    const value = headers[key];
    if (typeof value === 'string') headers[key] = unquoteText(value);
  }
}

function normalizeTransport(options: TransportOptions | undefined): void {
  if (!options) return;
  if (typeof options.path === 'string') options.path = unquoteText(options.path);
  if (typeof options.host === 'string') options.host = unquoteText(options.host);
  if (Array.isArray(options.host)) options.host = options.host.map((item) => unquoteText(item));
  const serviceName = options['grpc-service-name'];
  if (typeof serviceName === 'string') {
    options['grpc-service-name'] = unquoteText(serviceName);
  }
  const earlyData = options['early-data-header-name'];
  if (typeof earlyData === 'string') {
    options['early-data-header-name'] = unquoteText(earlyData);
  }
  normalizeHeaders(options.headers);
}

function normalizePlugin(options: PluginOptions | undefined): void {
  if (!options) return;
  if (typeof options.host === 'string') options.host = unquoteText(options.host);
  if (typeof options.path === 'string') options.path = unquoteText(options.path);
}

/**
 * Strip stray quotes from text fields that end up in transport or TLS output.
 * Credentials are left untouched because quotes may be part of the secret.
 */
export function normalizeNodeText(node: ProxyNode): ProxyNode {
  if (typeof node.sni === 'string') node.sni = unquoteText(node.sni);
  if (typeof node.servername === 'string') node.servername = unquoteText(node.servername);
  if (node.alpn) node.alpn = node.alpn.map((item) => unquoteText(item)).filter(Boolean);
  normalizeTransport(node['ws-opts']);
  normalizeTransport(node['grpc-opts']);
  normalizeTransport(node['xhttp-opts']);
  normalizeTransport(node['h2-opts']);
  normalizeTransport(node['http-opts']);
  normalizePlugin(node['plugin-opts']);
  return node;
}
