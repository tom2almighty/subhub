import type { ProxyNode } from '@subhub/shared';
import {
  cleanHost,
  decodeBase64,
  parseBool,
  parseIntOrUndefined,
  parseQuery,
  safeDecode,
  splitFragment,
  splitHostPort,
  splitList,
} from '../util.js';

type UriParser = (line: string) => ProxyNode;

const parsers: { test: RegExp; parse: UriParser }[] = [];

function register(test: RegExp, parse: UriParser) {
  parsers.push({ test, parse });
}

export function parseUri(line: string): ProxyNode {
  for (const parser of parsers) {
    if (parser.test.test(line)) return parser.parse(line);
  }
  throw new Error(`Unsupported URI scheme: ${line.slice(0, 40)}`);
}

export function isUriLike(line: string): boolean {
  return parsers.some((parser) => parser.test.test(line));
}

function buildName(name: string | undefined, type: string, server: string, port: number): string {
  return name?.trim() || `${type} ${server}:${port}`;
}

function parseSS(line: string): ProxyNode {
  let content = line.slice('ss://'.length);
  const { body, name } = splitFragment(content);
  content = body.replace(/\/$/, '');

  const queryIndex = content.indexOf('?');
  const query = queryIndex >= 0 ? parseQuery(content.slice(queryIndex + 1)) : {};
  const main = queryIndex >= 0 ? content.slice(0, queryIndex) : content;

  const at = main.lastIndexOf('@');
  let userInfo: string;
  let hostPort: string;
  if (at >= 0) {
    userInfo = main.slice(0, at);
    hostPort = main.slice(at + 1);
  } else {
    const decoded = decodeBase64(main);
    const decodedAt = decoded.lastIndexOf('@');
    if (decodedAt < 0) throw new Error('Invalid shadowsocks URI');
    userInfo = decoded.slice(0, decodedAt);
    hostPort = decoded.slice(decodedAt + 1);
  }

  const host = splitHostPort(hostPort);
  if (!host) throw new Error('Invalid shadowsocks host/port');

  let plainUserInfo = safeDecode(userInfo) ?? userInfo;
  try {
    if (!plainUserInfo.includes(':')) plainUserInfo = decodeBase64(plainUserInfo);
  } catch {
    // keep original
  }
  const colon = plainUserInfo.indexOf(':');
  if (colon < 0) throw new Error('Shadowsocks user info must contain method and password');
  const cipher = plainUserInfo.slice(0, colon);
  const password = plainUserInfo.slice(colon + 1);

  const node: ProxyNode = {
    name: buildName(name, 'ss', host.host, host.port),
    type: 'ss',
    server: host.host,
    port: host.port,
    cipher,
    password,
  };

  const plugin = query.plugin;
  if (plugin) {
    const parts = plugin.split(';');
    const pluginName = parts.shift() ?? '';
    const opts: Record<string, string> = {};
    for (const part of parts) {
      const index = part.indexOf('=');
      if (index < 0) opts[part] = '';
      else opts[part.slice(0, index)] = part.slice(index + 1);
    }
    if (pluginName === 'obfs-local' || pluginName === 'simple-obfs') {
      node.plugin = 'obfs';
      node['plugin-opts'] = {
        mode: opts.obfs ?? 'http',
        host: opts['obfs-host'],
        path: opts['obfs-uri'],
      };
    } else if (pluginName === 'v2ray-plugin') {
      node.plugin = 'v2ray-plugin';
      node['plugin-opts'] = {
        mode: opts.mode ?? 'websocket',
        host: opts.host,
        path: opts.path,
        tls: 'tls' in opts,
      };
    } else {
      node.plugin = pluginName;
      node['plugin-opts'] = opts;
    }
  }

  return node;
}

function parseVmess(line: string): ProxyNode {
  const payload = line.slice('vmess://'.length);
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(decodeBase64(payload)) as Record<string, unknown>;
  } catch {
    // Some clients export vmess://uuid@host:port?... form.
    return parseVmessUrl(line);
  }

  const server = `${data.add ?? ''}`;
  const port = parseIntOrUndefined(data.port);
  const uuid = `${data.id ?? ''}`;
  if (!server || !port || !uuid) throw new Error('Invalid VMess URI');

  const net = `${data.net ?? 'tcp'}`.toLowerCase();
  const tlsValue = `${data.tls ?? ''}`.toLowerCase();
  const node: ProxyNode = {
    name: buildName(`${data.ps ?? ''}`, 'vmess', server, port),
    type: 'vmess',
    server,
    port,
    uuid,
    alterId: parseIntOrUndefined(data.aid) ?? 0,
    cipher: `${data.scy ?? 'auto'}`,
    udp: true,
  };

  if (tlsValue === 'tls' || tlsValue === 'reality') {
    node.tls = true;
    node.sni = `${data.sni ?? data.host ?? ''}` || undefined;
  }
  if (data.alpn) node.alpn = splitList(data.alpn);
  if (data.fp) node['client-fingerprint'] = `${data.fp}`;

  const host = `${data.host ?? ''}`;
  const path = `${data.path ?? ''}`;
  applyTransport(node, net, { host, path });
  return node;
}

function parseVmessUrl(line: string): ProxyNode {
  const url = new URL(line);
  const uuid = safeDecode(url.username);
  const server = cleanHost(url.hostname);
  const port = Number.parseInt(url.port, 10);
  if (!uuid || !server || !port) throw new Error('Invalid VMess URI');
  const query = Object.fromEntries(url.searchParams.entries());
  const node: ProxyNode = {
    name: buildName(safeDecode(url.hash.slice(1)), 'vmess', server, port),
    type: 'vmess',
    server,
    port,
    uuid,
    alterId: 0,
    cipher: query.scy ?? 'auto',
    udp: true,
  };
  const security = query.security ?? query.tls;
  if (security === 'tls' || security === 'reality') {
    node.tls = true;
    node.sni = query.sni ?? query.host;
  }
  if (query.alpn) node.alpn = query.alpn.split(',');
  applyTransport(node, query.type ?? 'tcp', { host: query.host ?? '', path: query.path ?? '' });
  return node;
}

function applyTransport(
  node: ProxyNode,
  network: string,
  options: { host?: string; path?: string; serviceName?: string },
) {
  const net = network.toLowerCase();
  if (net === 'tcp' || net === 'raw' || net === '') return;
  node.network = net;
  if (net === 'ws' || net === 'httpupgrade') {
    node['ws-opts'] = {
      path: options.path ?? '/',
      headers: options.host ? { Host: options.host } : {},
    };
    if (net === 'httpupgrade') {
      node['ws-opts'] = { ...node['ws-opts'], 'v2ray-http-upgrade': true };
    }
  } else if (net === 'grpc') {
    node['grpc-opts'] = {
      'grpc-service-name': options.serviceName ?? options.path ?? '',
    };
  } else if (net === 'h2' || net === 'http') {
    node['h2-opts'] = {
      host: options.host,
      path: options.path ?? '/',
    };
  }
}

function parseVless(line: string): ProxyNode {
  const url = new URL(line);
  const uuid = safeDecode(url.username);
  const server = cleanHost(url.hostname);
  const port = Number.parseInt(url.port, 10);
  if (!uuid || !server || !port) throw new Error('Invalid VLESS URI');
  const query = Object.fromEntries(url.searchParams.entries());
  const security = `${query.security ?? 'none'}`.toLowerCase();
  const node: ProxyNode = {
    name: buildName(safeDecode(url.hash.slice(1)), 'vless', server, port),
    type: 'vless',
    server,
    port,
    uuid,
    udp: true,
  };
  if (security === 'tls' || security === 'reality') {
    node.tls = true;
    node.sni = query.sni ?? query.host;
  }
  if (security === 'reality') {
    node['reality-opts'] = {
      'public-key': query.pbk ?? '',
      'short-id': query.sid ?? '',
    };
  }
  if (query.flow) node.flow = query.flow;
  if (query.alpn) node.alpn = query.alpn.split(',');
  if (query.fp) node['client-fingerprint'] = query.fp;
  if (parseBool(query.allowInsecure ?? query.insecure)) node['skip-cert-verify'] = true;
  applyTransport(node, query.type ?? 'tcp', {
    host: query.host ?? '',
    path: query.path ?? '',
    serviceName: query.serviceName ?? '',
  });
  return node;
}

function parseTrojan(line: string): ProxyNode {
  const url = new URL(line);
  const password = safeDecode(url.username);
  const server = cleanHost(url.hostname);
  const port = Number.parseInt(url.port, 10);
  if (!password || !server || !port) throw new Error('Invalid Trojan URI');
  const query = Object.fromEntries(url.searchParams.entries());
  const security = `${query.security ?? 'tls'}`.toLowerCase();
  const node: ProxyNode = {
    name: buildName(safeDecode(url.hash.slice(1)), 'trojan', server, port),
    type: 'trojan',
    server,
    port,
    password,
    udp: true,
  };
  if (security !== 'none') node.tls = true;
  node.sni = query.sni ?? query.peer ?? undefined;
  if (query.alpn) node.alpn = query.alpn.split(',');
  if (query.fp) node['client-fingerprint'] = query.fp;
  if (parseBool(query.allowInsecure ?? query.insecure)) node['skip-cert-verify'] = true;
  applyTransport(node, query.type ?? 'tcp', {
    host: query.host ?? '',
    path: query.path ?? '',
    serviceName: query.serviceName ?? '',
  });
  return node;
}

function parseHysteria2(line: string): ProxyNode {
  const url = new URL(line);
  const password = safeDecode(url.username) || safeDecode(url.password);
  const server = cleanHost(url.hostname);
  const port = Number.parseInt(url.port, 10);
  if (!password || !server || !port) throw new Error('Invalid Hysteria2 URI');
  const query = Object.fromEntries(url.searchParams.entries());
  const node: ProxyNode = {
    name: buildName(safeDecode(url.hash.slice(1)), 'hysteria2', server, port),
    type: 'hysteria2',
    server,
    port,
    password,
    tls: true,
    udp: true,
  };
  node.sni = query.sni ?? query.peer ?? undefined;
  node['skip-cert-verify'] = parseBool(query.insecure);
  if (query.obfs) node.obfs = query.obfs;
  if (query['obfs-password']) node['obfs-password'] = query['obfs-password'];
  if (query.up) node.up = query.up;
  if (query.down) node.down = query.down;
  if (query.ports) node.ports = query.ports;
  if (query.alpn) node.alpn = query.alpn.split(',');
  return node;
}

function parseTuic(line: string): ProxyNode {
  const url = new URL(line);
  const uuid = safeDecode(url.username);
  const password = safeDecode(url.password);
  const server = cleanHost(url.hostname);
  const port = Number.parseInt(url.port, 10);
  if (!uuid || !server || !port) throw new Error('Invalid TUIC URI');
  const query = Object.fromEntries(url.searchParams.entries());
  const node: ProxyNode = {
    name: buildName(safeDecode(url.hash.slice(1)), 'tuic', server, port),
    type: 'tuic',
    server,
    port,
    uuid,
    password,
    tls: true,
    udp: true,
  };
  node.sni = query.sni ?? undefined;
  node['skip-cert-verify'] = parseBool(query.allow_insecure ?? query.insecure);
  if (query.alpn) node.alpn = query.alpn.split(',');
  if (query.congestion_control) node['congestion-controller'] = query.congestion_control;
  if (query.udp_relay_mode) node['udp-relay-mode'] = query.udp_relay_mode;
  if (parseBool(query.disable_sni)) node['disable-sni'] = true;
  return node;
}

function parseAnyTls(line: string): ProxyNode {
  const url = new URL(line);
  const password = safeDecode(url.username);
  const server = cleanHost(url.hostname);
  const port = Number.parseInt(url.port, 10);
  if (!password || !server || !port) throw new Error('Invalid AnyTLS URI');
  const query = Object.fromEntries(url.searchParams.entries());
  const node: ProxyNode = {
    name: buildName(safeDecode(url.hash.slice(1)), 'anytls', server, port),
    type: 'anytls',
    server,
    port,
    password,
    tls: true,
    udp: true,
  };
  node.sni = query.sni ?? undefined;
  node['skip-cert-verify'] = parseBool(query.insecure ?? query.allowInsecure);
  if (query.alpn) node.alpn = query.alpn.split(',');
  return node;
}

function parseWireGuard(line: string): ProxyNode {
  const url = new URL(line);
  const server = cleanHost(url.hostname);
  const port = Number.parseInt(url.port, 10);
  const privateKey = safeDecode(url.username) || safeDecode(url.password);
  if (!privateKey || !server || !port) throw new Error('Invalid WireGuard URI');
  const query = Object.fromEntries(url.searchParams.entries());
  const node: ProxyNode = {
    name: buildName(safeDecode(url.hash.slice(1)), 'wireguard', server, port),
    type: 'wireguard',
    server,
    port,
    'private-key': privateKey,
    'public-key': query.publickey ?? query['public-key'] ?? '',
    'pre-shared-key': query.presharedkey ?? query['pre-shared-key'] ?? '',
    udp: true,
  };
  const address = query.address ?? query.ip ?? '';
  for (const item of address.split(',')) {
    const trimmed = item.trim();
    if (!trimmed) continue;
    if (trimmed.includes(':')) node.ipv6 = trimmed;
    else node.ip = trimmed;
  }
  if (query.mtu) node.mtu = parseIntOrUndefined(query.mtu);
  if (query.reserved) node.reserved = query.reserved.split(',').map((v) => Number(v));
  return node;
}

function parseSnell(line: string): ProxyNode {
  const url = new URL(line);
  const psk = safeDecode(url.username) || safeDecode(url.password);
  const server = cleanHost(url.hostname);
  const port = Number.parseInt(url.port, 10);
  if (!psk || !server || !port) throw new Error('Invalid Snell URI');
  const query = Object.fromEntries(url.searchParams.entries());
  const node: ProxyNode = {
    name: buildName(safeDecode(url.hash.slice(1)), 'snell', server, port),
    type: 'snell',
    server,
    port,
    psk,
    version: parseIntOrUndefined(query.version) ?? 4,
    udp: true,
  };
  if (query.obfs) {
    node['obfs-opts'] = {
      mode: query.obfs,
      host: query['obfs-host'],
    };
  }
  return node;
}

function parseSocks(line: string): ProxyNode {
  const url = new URL(line);
  const server = cleanHost(url.hostname);
  const port = Number.parseInt(url.port, 10) || 1080;
  if (!server) throw new Error('Invalid SOCKS URI');
  const node: ProxyNode = {
    name: buildName(safeDecode(url.hash.slice(1)), 'socks5', server, port),
    type: 'socks5',
    server,
    port,
    username: safeDecode(url.username) || undefined,
    password: safeDecode(url.password) || undefined,
    udp: true,
  };
  if (line.startsWith('socks5+tls://')) node.tls = true;
  return node;
}

function parseHttp(line: string): ProxyNode {
  const url = new URL(line);
  const server = cleanHost(url.hostname);
  const port = Number.parseInt(url.port, 10) || (url.protocol === 'https:' ? 443 : 80);
  if (!server) throw new Error('Invalid HTTP URI');
  return {
    name: buildName(safeDecode(url.hash.slice(1)), 'http', server, port),
    type: 'http',
    server,
    port,
    username: safeDecode(url.username) || undefined,
    password: safeDecode(url.password) || undefined,
    tls: url.protocol === 'https:',
  };
}

register(/^ss:\/\//i, parseSS);
register(/^vmess:\/\//i, parseVmess);
register(/^vless:\/\//i, parseVless);
register(/^trojan:\/\//i, parseTrojan);
register(/^(hysteria2|hy2):\/\//i, parseHysteria2);
register(/^tuic:\/\//i, parseTuic);
register(/^anytls:\/\//i, parseAnyTls);
register(/^(wireguard|wg):\/\//i, parseWireGuard);
register(/^snell:\/\//i, parseSnell);
register(/^(socks5|socks5\+tls|socks):\/\//i, parseSocks);
register(/^https?:\/\//i, parseHttp);
