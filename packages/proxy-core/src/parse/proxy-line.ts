import type { ProxyNode, ProxyType } from '@subhub/shared';
import { parseBool, parseIntOrUndefined, splitHostPort, splitList } from '../util.js';

type Params = Record<string, string>;

const SURGE_TYPES: Record<string, ProxyType> = {
  ss: 'ss',
  shadowsocks: 'ss',
  vmess: 'vmess',
  vless: 'vless',
  trojan: 'trojan',
  hysteria2: 'hysteria2',
  hy2: 'hysteria2',
  tuic: 'tuic',
  'tuic-v5': 'tuic',
  anytls: 'anytls',
  snell: 'snell',
  http: 'http',
  https: 'http',
  socks5: 'socks5',
};

const QX_TYPES: Record<string, ProxyType> = {
  shadowsocks: 'ss',
  ss: 'ss',
  vmess: 'vmess',
  vless: 'vless',
  trojan: 'trojan',
  anytls: 'anytls',
  hysteria2: 'hysteria2',
  http: 'http',
  https: 'http',
  socks5: 'socks5',
};

export const PROXY_SECTIONS = new Set(['proxy', 'server_local', 'server_remote']);

export function isProxySection(name: string): boolean {
  return PROXY_SECTIONS.has(name.trim().toLowerCase());
}

function splitTokens(value: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let quote: string | null = null;
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index] ?? '';
    if (quote) {
      if (char === '\\' && index + 1 < value.length) {
        current += char + (value[index + 1] ?? '');
        index += 1;
        continue;
      }
      if (char === quote) quote = null;
      current += char;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      current += char;
      continue;
    }
    if (char === ',') {
      tokens.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  tokens.push(current.trim());
  return tokens;
}

function unquote(value: string | undefined): string {
  if (!value) return '';
  let text = value.trim();
  if (text.length >= 2) {
    const first = text[0];
    const last = text[text.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      text = text.slice(1, -1);
    }
  }
  return text.replace(/\\(["'\\])/g, '$1');
}

function parseParams(tokens: string[]): Params {
  const params: Params = {};
  for (const token of tokens) {
    if (!token) continue;
    const index = token.indexOf('=');
    if (index <= 0) continue;
    params[token.slice(0, index).trim().toLowerCase()] = unquote(token.slice(index + 1));
  }
  return params;
}

function applyTls(node: ProxyNode, params: Params): void {
  if (parseBool(params.tls) || parseBool(params['over-tls'])) node.tls = true;
  const sni = params.sni ?? params['tls-name'] ?? params.servername;
  if (sni) node.sni = sni;
  if (parseBool(params['skip-cert-verify'])) node['skip-cert-verify'] = true;
  if (params.alpn) node.alpn = splitList(params.alpn);
  if (params.flow) node.flow = params.flow;
  if (params['client-fingerprint']) node['client-fingerprint'] = params['client-fingerprint'];
  const publicKey = params['reality-public-key'] ?? params['public-key'];
  const shortId = params['reality-short-id'] ?? params['short-id'];
  if (publicKey || shortId) {
    node.tls = true;
    node['reality-opts'] = { 'public-key': publicKey ?? '', 'short-id': shortId ?? '' };
  }
}

function applySurgeTransport(node: ProxyNode, params: Params): void {
  if (parseBool(params.ws) || params.transport === 'ws') {
    node.network = 'ws';
    const headers: Record<string, string> = {};
    const host = params.host ?? params['ws-host'];
    if (host) headers.Host = host;
    if (params['ws-headers']) {
      for (const pair of params['ws-headers'].split('|')) {
        const index = pair.indexOf(':');
        if (index <= 0) continue;
        headers[pair.slice(0, index).trim()] = pair.slice(index + 1).trim();
      }
    }
    node['ws-opts'] = { path: params['ws-path'] ?? params.path ?? '/', headers };
    return;
  }
  if (parseBool(params.grpc) || params.transport === 'grpc') {
    node.network = 'grpc';
    node['grpc-opts'] = {
      'grpc-service-name': params['grpc-service-name'] ?? params.path ?? '',
    };
    return;
  }
  if (params.transport === 'http') {
    node.network = 'http';
    node['http-opts'] = {
      path: params.path ?? '/',
      headers: params.host ? { Host: params.host } : {},
    };
  }
}

function applyFlags(node: ProxyNode, params: Params): void {
  if (parseBool(params['udp-relay']) || parseBool(params.udp)) node.udp = true;
  if (parseBool(params.tfo) || parseBool(params['fast-open'])) node.tfo = true;
  if (params['ip-mode']) node['ip-version'] = params['ip-mode'];
}

function isPositional(tokens: string[]): boolean {
  return Boolean(tokens[0]) && !tokens[0]?.includes('=');
}

function buildNode(type: ProxyType, server: string, port: number, name: string): ProxyNode {
  return { name, type, server, port };
}

function parseSurgeLike(line: string): ProxyNode | null {
  const match = /^(.*?)\s*=\s*([A-Za-z0-9_-]+)\s*,\s*(.*)$/.exec(line);
  if (!match) return null;
  const [, rawName, rawType, rest] = match;
  if (!rawName || !rawType || rest === undefined) return null;
  const type = SURGE_TYPES[rawType.toLowerCase()];
  if (!type) return null;

  const tokens = splitTokens(rest);
  const server = unquote(tokens[0]);
  const port = Number.parseInt(tokens[1] ?? '', 10);
  if (!server || !Number.isInteger(port) || port <= 0 || port > 65535) return null;

  const tail = tokens.slice(2);
  const params = parseParams(tail);
  const positional = isPositional(tail);
  const tlsByType = rawType.toLowerCase() === 'https';
  const name = unquote(rawName) || `${type} ${server}:${port}`;
  const node = buildNode(type, server, port, name);

  applyTls(node, params);
  applySurgeTransport(node, params);
  applyFlags(node, params);
  if (tlsByType) node.tls = true;

  switch (type) {
    case 'ss': {
      node.cipher = (positional ? unquote(tail[0]) : params['encrypt-method']) || 'none';
      node.password = positional ? unquote(tail[1]) : (params.password ?? '');
      if (params.obfs && !params['obfs-name']) {
        node.plugin = 'obfs';
        node['plugin-opts'] = {
          mode: params.obfs,
          host: params['obfs-host'],
          path: params['obfs-uri'],
        };
      } else if (params['obfs-name']) {
        node.plugin = 'obfs';
        node['plugin-opts'] = {
          mode: params['obfs-name'],
          host: params['obfs-host'],
          path: params['obfs-uri'],
        };
      } else if (params['shadow-tls-password']) {
        node.plugin = 'shadow-tls';
        node['plugin-opts'] = {
          password: params['shadow-tls-password'],
          host: params['shadow-tls-sni'],
          version: parseIntOrUndefined(params['shadow-tls-version']),
        };
      }
      break;
    }
    case 'vmess': {
      node.uuid = positional ? unquote(tail[1]) : (params.username ?? params.password ?? '');
      node.cipher = (positional ? unquote(tail[0]) : params['encrypt-method']) || 'auto';
      node.alterId = parseIntOrUndefined(params.alterid) ?? 0;
      node.udp = true;
      break;
    }
    case 'vless': {
      node.uuid = positional ? unquote(tail[0]) : (params.username ?? params.password ?? '');
      node.udp = true;
      break;
    }
    case 'trojan': {
      node.password = positional ? unquote(tail[0]) : (params.password ?? '');
      node.udp = true;
      break;
    }
    case 'hysteria2': {
      node.password = positional ? unquote(tail[0]) : (params.password ?? '');
      node.tls = true;
      node.udp = true;
      if (params['salamander-password']) {
        node.obfs = 'salamander';
        node['obfs-password'] = params['salamander-password'];
      } else if (params['gecko-password']) {
        node.obfs = 'gecko';
        node['obfs-password'] = params['gecko-password'];
      }
      if (params['download-bandwidth']) node.down = params['download-bandwidth'];
      if (params['port-hopping']) node.ports = params['port-hopping'].replace(/;/g, ',');
      if (params['server-ports']) node.ports = params['server-ports'];
      break;
    }
    case 'tuic': {
      node.uuid = params.uuid || undefined;
      node.password = params.password || undefined;
      node.token = node.uuid ? undefined : params.token || undefined;
      node.tls = true;
      node.udp = true;
      break;
    }
    case 'anytls': {
      node.password = positional ? unquote(tail[0]) : (params.password ?? '');
      node.tls = true;
      node.udp = true;
      break;
    }
    case 'snell': {
      node.psk = params.psk ?? '';
      node.version = parseIntOrUndefined(params.version) ?? 4;
      node.udp = true;
      if (params.obfs) {
        node['obfs-opts'] = { mode: params.obfs, host: params['obfs-host'] };
      }
      break;
    }
    case 'http': {
      node.username = params.username || undefined;
      node.password = params.password || undefined;
      break;
    }
    case 'socks5': {
      node.username = params.username || undefined;
      node.password = params.password || undefined;
      break;
    }
    default:
      return null;
  }

  return node;
}

function decodeAlpn(value: string): string[] | undefined {
  const hex = value.replace(/[^0-9a-f]/gi, '');
  const items: string[] = [];
  let index = 0;
  while (index + 2 <= hex.length) {
    const length = Number.parseInt(hex.slice(index, index + 2), 16);
    index += 2;
    if (!Number.isFinite(length) || index + length * 2 > hex.length) break;
    items.push(Buffer.from(hex.slice(index, index + length * 2), 'hex').toString('utf8'));
    index += length * 2;
  }
  return items.length > 0 ? items : undefined;
}

function parseQxLine(line: string): ProxyNode | null {
  const match = /^([A-Za-z0-9_-]+)\s*=\s*([^,\s]+)\s*(?:,(.*))?$/.exec(line);
  if (!match) return null;
  const [, rawType, address, rest] = match;
  if (!rawType || !address) return null;
  const type = QX_TYPES[rawType.toLowerCase()];
  if (!type) return null;

  const host = splitHostPort(address);
  if (!host) return null;
  const tokens = splitTokens(rest ?? '');
  const params = parseParams(tokens);
  const name = params.tag || `${type} ${host.host}:${host.port}`;
  const node = buildNode(type, host.host, host.port, name);
  if (rawType.toLowerCase() === 'https') node.tls = true;

  if (parseBool(params['over-tls'])) node.tls = true;
  if (params['tls-verification'] === 'false') node['skip-cert-verify'] = true;
  const sni = params['tls-host'] ?? params.sni;
  if (sni) node.sni = sni;
  if (params['tls-alpn']) node.alpn = decodeAlpn(params['tls-alpn']);
  if (params['reality-base64-pubkey'] || params['reality-hex-shortid']) {
    node.tls = true;
    node['reality-opts'] = {
      'public-key': params['reality-base64-pubkey'] ?? '',
      'short-id': params['reality-hex-shortid'] ?? '',
    };
  }
  if (parseBool(params['fast-open'])) node.tfo = true;
  if (parseBool(params['udp-relay'])) node.udp = true;

  const obfs = params.obfs;
  if (obfs === 'ws' || obfs === 'wss') {
    node.network = 'ws';
    if (obfs === 'wss') node.tls = true;
    node['ws-opts'] = {
      path: params['obfs-uri'] ?? '/',
      headers: params['obfs-host'] ? { Host: params['obfs-host'] } : {},
    };
  } else if (obfs === 'http') {
    node.network = 'http';
    node['http-opts'] = {
      path: params['obfs-uri'] ?? '/',
      headers: params['obfs-host'] ? { Host: params['obfs-host'] } : {},
    };
  } else if (obfs === 'over-tls') {
    node.tls = true;
  }

  switch (type) {
    case 'ss': {
      node.cipher = params.method ?? 'none';
      node.password = params.password ?? '';
      break;
    }
    case 'vmess': {
      node.uuid = params.password ?? '';
      node.cipher = params.method ?? 'auto';
      node.alterId = params.aead === 'false' ? 1 : 0;
      node.udp = true;
      break;
    }
    case 'vless': {
      node.uuid = params.password ?? '';
      if (params['vless-flow']) node.flow = params['vless-flow'];
      node.udp = true;
      break;
    }
    case 'trojan': {
      node.password = params.password ?? '';
      node.udp = true;
      break;
    }
    case 'anytls': {
      node.password = params.password ?? '';
      node.tls = true;
      break;
    }
    case 'hysteria2': {
      node.password = params.password ?? '';
      node.tls = true;
      node.udp = true;
      break;
    }
    case 'http':
    case 'socks5': {
      node.username = params.username || undefined;
      node.password = params.password || undefined;
      break;
    }
    default:
      return null;
  }

  return node;
}

export function parseProxyLine(line: string): ProxyNode | null {
  return parseQxLine(line) ?? parseSurgeLike(line);
}
