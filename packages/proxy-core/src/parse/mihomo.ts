import { PROXY_TYPES, type ProxyNode, type ProxyType } from '@subhub/shared';
import { parse as parseYaml } from 'yaml';
import { normalizeNodeText } from '../text.js';
import { parseBool, parseIntOrUndefined, splitList } from '../util.js';

const knownTypes = new Set<string>(PROXY_TYPES);

function isPlainObject(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeName(value: unknown, fallback: string): string {
  const name = `${value ?? ''}`.trim();
  return name || fallback;
}

function normalizeTransport(node: ProxyNode, raw: Record<string, any>) {
  const network = `${raw.network ?? ''}`.toLowerCase();
  if (!network) return;
  node.network = network;
  if (network === 'ws') {
    const opts = isPlainObject(raw['ws-opts']) ? raw['ws-opts'] : {};
    node['ws-opts'] = {
      path: `${opts.path ?? '/'}`,
      headers: isPlainObject(opts.headers) ? opts.headers : {},
      'max-early-data': opts['max-early-data'],
      'early-data-header-name': opts['early-data-header-name'],
      'v2ray-http-upgrade': parseBool(opts['v2ray-http-upgrade']),
    };
  } else if (network === 'grpc') {
    const opts = isPlainObject(raw['grpc-opts']) ? raw['grpc-opts'] : {};
    node['grpc-opts'] = {
      'grpc-service-name': `${opts['grpc-service-name'] ?? ''}`,
      'grpc-mode': opts['grpc-mode'],
      'grpc-authority': opts['grpc-authority'],
    };
  } else if (network === 'xhttp') {
    const opts = isPlainObject(raw['xhttp-opts']) ? raw['xhttp-opts'] : {};
    node['xhttp-opts'] = {
      path: `${opts.path ?? '/'}`,
      host: opts.host,
      mode: opts.mode,
      headers: isPlainObject(opts.headers) ? opts.headers : {},
    };
  } else if (network === 'h2') {
    const opts = isPlainObject(raw['h2-opts']) ? raw['h2-opts'] : {};
    node['h2-opts'] = {
      host: opts.host,
      path: `${opts.path ?? '/'}`,
    };
  } else if (network === 'http') {
    const opts = isPlainObject(raw['http-opts']) ? raw['http-opts'] : {};
    node['http-opts'] = {
      path: opts.path,
      headers: isPlainObject(opts.headers) ? opts.headers : {},
    };
  }
}

function normalizeTls(node: ProxyNode, raw: Record<string, any>) {
  if (parseBool(raw.tls) || parseBool(raw['over-tls'])) node.tls = true;
  const serverName = raw.servername ?? raw.sni;
  if (serverName) node.sni = `${serverName}`;
  if (raw.alpn) node.alpn = splitList(raw.alpn);
  if (parseBool(raw['skip-cert-verify'])) node['skip-cert-verify'] = true;
  if (raw['client-fingerprint']) node['client-fingerprint'] = `${raw['client-fingerprint']}`;
  if (isPlainObject(raw['reality-opts'])) {
    node.tls = true;
    node['reality-opts'] = {
      'public-key': `${raw['reality-opts']['public-key'] ?? ''}`,
      'short-id': `${raw['reality-opts']['short-id'] ?? ''}`,
    };
  }
}

function normalizeMihomoProxy(raw: Record<string, any>): ProxyNode {
  const type = `${raw.type ?? ''}`.toLowerCase();
  if (!knownTypes.has(type)) {
    throw new Error(`Unsupported proxy type: ${type}`);
  }
  if (type === 'tailscale') {
    return {
      ...(raw as ProxyNode),
      name: normalizeName(raw.name, 'tailscale'),
      type: 'tailscale',
    };
  }
  const server = `${raw.server ?? ''}`.trim();
  const port = parseIntOrUndefined(raw.port);
  if (!server || !port) throw new Error('Proxy is missing server or port');
  const node: ProxyNode = {
    ...(raw as ProxyNode),
    name: normalizeName(raw.name, `${type} ${server}:${port}`),
    type: type as ProxyType,
    server,
    port,
  };

  if (raw.uuid) node.uuid = `${raw.uuid}`;
  if (raw.password != null) node.password = `${raw.password}`;
  if (raw.username != null) node.username = `${raw.username}`;
  if (raw.cipher) node.cipher = `${raw.cipher}`;
  if (raw.psk) node.psk = `${raw.psk}`;
  if (raw.token) node.token = `${raw.token}`;
  if (raw.alterId != null) node.alterId = parseIntOrUndefined(raw.alterId) ?? 0;
  if (raw.flow) node.flow = `${raw.flow}`;
  if (raw.version != null) node.version = parseIntOrUndefined(raw.version);
  if (raw.udp != null) node.udp = parseBool(raw.udp);
  if (raw.tfo != null) node.tfo = parseBool(raw.tfo);
  if (raw['ip-version']) node['ip-version'] = `${raw['ip-version']}`;

  normalizeTls(node, raw);
  normalizeTransport(node, raw);

  if (type === 'ss') {
    node.cipher = node.cipher || 'none';
    if (raw.plugin) {
      node.plugin = `${raw.plugin}`;
      if (isPlainObject(raw['plugin-opts'])) {
        node['plugin-opts'] = { ...raw['plugin-opts'] };
      }
    }
  } else if (type === 'hysteria2') {
    node.tls = true;
    if (raw.obfs) node.obfs = `${raw.obfs}`;
    if (raw['obfs-password']) node['obfs-password'] = `${raw['obfs-password']}`;
    if (raw.up != null) node.up = `${raw.up}`;
    if (raw.down != null) node.down = `${raw.down}`;
    if (raw.ports != null) node.ports = `${raw.ports}`;
  } else if (type === 'tuic') {
    node.tls = true;
    if (raw['congestion-controller']) {
      node['congestion-controller'] = `${raw['congestion-controller']}`;
    }
    if (raw['udp-relay-mode']) node['udp-relay-mode'] = `${raw['udp-relay-mode']}`;
    if (raw['disable-sni'] != null) node['disable-sni'] = parseBool(raw['disable-sni']);
  } else if (type === 'anytls') {
    node.tls = true;
  } else if (type === 'wireguard') {
    const peer = Array.isArray(raw.peers) && raw.peers.length > 0 ? raw.peers[0] : raw;
    node.server = `${peer.server ?? server}`;
    node.port = parseIntOrUndefined(peer.port) ?? port;
    if (peer['public-key']) node['public-key'] = `${peer['public-key']}`;
    if (peer['pre-shared-key']) node['pre-shared-key'] = `${peer['pre-shared-key']}`;
    if (Array.isArray(peer.reserved)) node.reserved = peer.reserved;
    if (raw['private-key']) node['private-key'] = `${raw['private-key']}`;
    if (raw.ip) node.ip = `${raw.ip}`;
    if (raw.ipv6) node.ipv6 = `${raw.ipv6}`;
    if (raw.mtu != null) node.mtu = parseIntOrUndefined(raw.mtu);
    if (raw.keepalive != null) node.keepalive = parseIntOrUndefined(raw.keepalive);
  } else if (type === 'snell') {
    node.psk = node.psk || node.password;
    if (isPlainObject(raw['obfs-opts'])) {
      node['obfs-opts'] = { ...raw['obfs-opts'] };
    }
  }

  return node;
}

export function normalizeProxyObject(raw: unknown): ProxyNode {
  if (!isPlainObject(raw)) throw new Error('Proxy entry is not an object');
  return normalizeNodeText(normalizeMihomoProxy(raw));
}

export function parseMihomoYaml(text: string): { nodes: ProxyNode[]; warnings: string[] } {
  const parsed = parseYaml(text) as unknown;
  return parseStructured(parsed);
}

function singboxTransport(node: ProxyNode, transport: unknown) {
  if (!isPlainObject(transport)) return;
  const type = `${transport.type ?? ''}`.toLowerCase();
  if (!type) return;
  node.network = type === 'http' ? 'http' : type;
  if (type === 'ws') {
    node['ws-opts'] = {
      path: `${transport.path ?? '/'}`,
      headers: isPlainObject(transport.headers) ? transport.headers : {},
    };
  } else if (type === 'grpc') {
    node['grpc-opts'] = {
      'grpc-service-name': `${transport.service_name ?? ''}`,
    };
  } else if (type === 'http' || type === 'h2') {
    node['h2-opts'] = {
      host: transport.host,
      path: `${transport.path ?? '/'}`,
    };
  } else if (type === 'httpupgrade') {
    node['ws-opts'] = {
      path: `${transport.path ?? '/'}`,
      headers: isPlainObject(transport.headers) ? transport.headers : {},
      'v2ray-http-upgrade': true,
    };
  }
}

function normalizeSingboxOutbound(raw: Record<string, any>): ProxyNode {
  const type = `${raw.type ?? ''}`.toLowerCase();
  const map: Record<string, ProxyType> = {
    shadowsocks: 'ss',
    vmess: 'vmess',
    vless: 'vless',
    trojan: 'trojan',
    hysteria2: 'hysteria2',
    tuic: 'tuic',
    anytls: 'anytls',
    wireguard: 'wireguard',
    http: 'http',
    socks: 'socks5',
    snell: 'snell',
  };
  const nodeType = map[type];
  if (!nodeType) throw new Error(`Unsupported sing-box outbound: ${type}`);
  const server = `${raw.server ?? raw.peers?.[0]?.server ?? ''}`.trim();
  const port = parseIntOrUndefined(raw.server_port ?? raw.port ?? raw.peers?.[0]?.server_port);
  if (!server || !port) throw new Error('Outbound is missing server or port');
  const node: ProxyNode = {
    name: normalizeName(raw.tag, `${nodeType} ${server}:${port}`),
    type: nodeType,
    server,
    port,
    udp: true,
  };
  if (raw.uuid) node.uuid = `${raw.uuid}`;
  if (raw.password != null) node.password = `${raw.password}`;
  if (raw.username != null) node.username = `${raw.username}`;
  if (raw.method) node.cipher = `${raw.method}`;
  if (raw.security) node.cipher = `${raw.security}`;
  if (raw.alter_id != null) node.alterId = parseIntOrUndefined(raw.alter_id) ?? 0;
  if (raw.flow) node.flow = `${raw.flow}`;
  if (raw.congestion_control) node['congestion-controller'] = `${raw.congestion_control}`;
  if (raw.udp_relay_mode) node['udp-relay-mode'] = `${raw.udp_relay_mode}`;
  if (raw.up_mbps != null) node.up = `${raw.up_mbps}`;
  if (raw.down_mbps != null) node.down = `${raw.down_mbps}`;
  if (isPlainObject(raw.obfs)) {
    node.obfs = `${raw.obfs.type ?? ''}`;
    node['obfs-password'] = `${raw.obfs.password ?? ''}`;
  }
  if (isPlainObject(raw.tls)) {
    if (parseBool(raw.tls.enabled)) node.tls = true;
    if (raw.tls.server_name) node.sni = `${raw.tls.server_name}`;
    if (raw.tls.alpn) node.alpn = splitList(raw.tls.alpn);
    if (parseBool(raw.tls.insecure)) node['skip-cert-verify'] = true;
    if (isPlainObject(raw.tls.reality)) {
      node['reality-opts'] = {
        'public-key': `${raw.tls.reality.public_key ?? ''}`,
        'short-id': `${raw.tls.reality.short_id ?? ''}`,
      };
    }
  }
  singboxTransport(node, raw.transport);
  if (nodeType === 'wireguard') {
    const peer = Array.isArray(raw.peers) ? raw.peers[0] : raw;
    node['private-key'] = `${raw.private_key ?? ''}`;
    node['public-key'] = `${peer?.public_key ?? ''}`;
    node['pre-shared-key'] = `${peer?.pre_shared_key ?? ''}`;
    if (Array.isArray(raw.local_address)) {
      for (const address of raw.local_address) {
        if (`${address}`.includes(':')) node.ipv6 = `${address}`;
        else node.ip = `${address}`;
      }
    }
    if (peer?.reserved) node.reserved = peer.reserved;
  }
  return node;
}

export function parseStructured(value: unknown): { nodes: ProxyNode[]; warnings: string[] } {
  const warnings: string[] = [];
  const nodes: ProxyNode[] = [];
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      try {
        nodes.push(normalizeProxyObject(item));
      } catch (error) {
        warnings.push(`#${index + 1}: ${(error as Error).message}`);
      }
    });
    return { nodes, warnings };
  }
  if (!isPlainObject(value)) return { nodes, warnings };

  const proxies = value.proxies;
  if (Array.isArray(proxies)) {
    proxies.forEach((item, index) => {
      try {
        nodes.push(normalizeProxyObject(item));
      } catch (error) {
        warnings.push(`#${index + 1}: ${(error as Error).message}`);
      }
    });
    return { nodes, warnings };
  }

  const outbounds = value.outbounds;
  if (Array.isArray(outbounds)) {
    for (const [index, item] of outbounds.entries()) {
      if (!isPlainObject(item)) continue;
      const type = `${item.type ?? ''}`.toLowerCase();
      if (['direct', 'block', 'dns', 'selector', 'urltest'].includes(type)) continue;
      try {
        nodes.push(normalizeNodeText(normalizeSingboxOutbound(item)));
      } catch (error) {
        warnings.push(`outbound #${index + 1}: ${(error as Error).message}`);
      }
    }
    return { nodes, warnings };
  }

  return { nodes, warnings };
}
