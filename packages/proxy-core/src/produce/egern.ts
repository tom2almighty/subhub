import type { ProxyNode } from '@subhub/shared';
import { stringify as stringifyYaml } from 'yaml';

const IP_VERSIONS: Record<string, string> = {
  dual: 'dual_stack',
  ipv4: 'v4_only',
  ipv6: 'v6_only',
  'v4-only': 'v4_only',
  'v6-only': 'v6_only',
  'ipv4-prefer': 'v4_prefer',
  'ipv6-prefer': 'v6_prefer',
  'prefer-v4': 'v4_prefer',
  'prefer-v6': 'v6_prefer',
};

const SUPPORTED_SS_CIPHERS = new Set([
  'chacha20-ietf-poly1305',
  'chacha20-poly1305',
  'aes-256-gcm',
  'aes-128-gcm',
  'none',
  'rc4',
  'rc4-md5',
  'aes-128-cfb',
  'aes-192-cfb',
  'aes-256-cfb',
  'aes-128-ctr',
  'aes-192-ctr',
  'aes-256-ctr',
  'bf-cfb',
  'camellia-128-cfb',
  'camellia-192-cfb',
  'camellia-256-cfb',
  'cast5-cfb',
  'des-cfb',
  'idea-cfb',
  'rc2-cfb',
  'seed-cfb',
  'salsa20',
  'chacha20',
  'chacha20-ietf',
  '2022-blake3-aes-128-gcm',
  '2022-blake3-aes-256-gcm',
]);

function stripUndefined(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'object' && !Array.isArray(value)) {
      const nested = stripUndefined(value as Record<string, unknown>);
      if (Object.keys(nested).length > 0) out[key] = nested;
    } else {
      out[key] = value;
    }
  }
  return out;
}

function getSni(node: ProxyNode): string | undefined {
  return node.sni ?? node.servername ?? (node.tls ? node.server : undefined);
}

function getReality(node: ProxyNode): Record<string, unknown> | undefined {
  const opts = node['reality-opts'];
  if (!opts) return undefined;
  const reality = stripUndefined({
    public_key: opts['public-key'] || undefined,
    short_id: opts['short-id'] || undefined,
  });
  return Object.keys(reality).length > 0 ? reality : undefined;
}

function getShadowTls(node: ProxyNode): Record<string, unknown> | undefined {
  if (node.plugin !== 'shadow-tls' || !node['plugin-opts']) return undefined;
  const opts = node['plugin-opts'];
  if (opts.version !== undefined && Number(opts.version) !== 3) {
    throw new Error(`Egern does not support shadow-tls version ${opts.version}`);
  }
  return stripUndefined({
    password: opts.password,
    sni: opts.host,
  });
}

function getTransport(node: ProxyNode, includePlainTcp: boolean): Record<string, unknown> | undefined {
  const network = node.network;
  const sni = getSni(node);
  const skipVerify = node['skip-cert-verify'];
  if (network === 'ws') {
    const key = node.tls ? 'wss' : 'ws';
    const host = node['ws-opts']?.headers?.Host;
    return {
      [key]: stripUndefined({
        path: node['ws-opts']?.path,
        headers: host ? { Host: host } : undefined,
        sni: node.tls ? sni : undefined,
        skip_tls_verify: node.tls ? skipVerify : undefined,
      }),
    };
  }
  if (network === 'http') {
    const httpOpts = node['http-opts'];
    const path = Array.isArray(httpOpts?.path) ? httpOpts.path[0] : httpOpts?.path;
    const rawHost = httpOpts?.headers?.Host;
    const host = Array.isArray(rawHost) ? rawHost[0] : rawHost;
    return {
      http1: stripUndefined({
        method: httpOpts?.method,
        path,
        headers: host ? { Host: host } : undefined,
        skip_tls_verify: skipVerify,
      }),
    };
  }
  if (network === 'h2') {
    const h2Opts = node['h2-opts'];
    const path = Array.isArray(h2Opts?.path) ? h2Opts.path[0] : h2Opts?.path;
    const host = Array.isArray(h2Opts?.host) ? h2Opts.host[0] : h2Opts?.host;
    return {
      http2: stripUndefined({
        path,
        headers: host ? { Host: host } : undefined,
        sni,
        skip_tls_verify: skipVerify,
      }),
    };
  }
  if (network === 'grpc') {
    return {
      grpc: stripUndefined({
        service_name: node['grpc-opts']?.['grpc-service-name'],
        sni,
        reality: getReality(node),
        skip_tls_verify: skipVerify,
      }),
    };
  }
  if ((!network || network === 'tcp') && (node.tls || includePlainTcp)) {
    const key = node.tls ? 'tls' : 'tcp';
    return {
      [key]: stripUndefined({
        sni: node.tls ? sni : undefined,
        skip_tls_verify: node.tls ? skipVerify : undefined,
        reality: node.tls ? getReality(node) : undefined,
      }),
    };
  }
  if (network && network !== 'tcp') {
    throw new Error(`Egern does not support ${node.type} network "${network}"`);
  }
  return undefined;
}

function withCidr(address: string | undefined, fallbackPrefix: number): string | undefined {
  if (!address) return undefined;
  return address.includes('/') ? address : `${address}/${fallbackPrefix}`;
}

export function toEgernObject(node: ProxyNode): Record<string, unknown> {
  if (!node.server || !node.port) {
    throw new Error(`Egern does not support ${node.type}`);
  }

  const prevHop = node['dialer-proxy'] ?? (node['underlying-proxy'] as string | undefined);
  const tfo = Boolean(node.tfo ?? node['fast-open']);
  const sni = getSni(node);
  const ipVersion = node['ip-version']
    ? (IP_VERSIONS[node['ip-version']] ?? node['ip-version'])
    : undefined;
  const fingerprint =
    typeof node['tls-fingerprint'] === 'string' && node['tls-fingerprint'].trim()
      ? node['tls-fingerprint'].trim()
      : undefined;

  let egernType: string;
  let body: Record<string, unknown>;

  switch (node.type) {
    case 'http': {
      egernType = node.tls ? 'https' : 'http';
      body = {
        name: node.name,
        server: node.server,
        port: node.port,
        username: node.username,
        password: node.password,
        tfo,
        ...(node.tls
          ? {
              sni,
              skip_tls_verify: node['skip-cert-verify'],
              reality: getReality(node),
              fingerprint_sha256: fingerprint,
            }
          : {}),
        shadow_tls: getShadowTls(node),
      };
      break;
    }
    case 'socks5': {
      egernType = node.tls ? 'socks5_tls' : 'socks5';
      body = {
        name: node.name,
        server: node.server,
        port: node.port,
        username: node.username,
        password: node.password,
        tfo,
        udp_relay: node.udp,
        ...(node.tls
          ? {
              sni,
              skip_tls_verify: node['skip-cert-verify'],
              reality: getReality(node),
              fingerprint_sha256: fingerprint,
            }
          : {}),
        shadow_tls: getShadowTls(node),
      };
      break;
    }
    case 'ss': {
      const cipher = node.cipher ?? 'aes-256-gcm';
      if (!SUPPORTED_SS_CIPHERS.has(cipher)) {
        throw new Error(`Egern does not support ss cipher "${cipher}"`);
      }
      egernType = 'shadowsocks';
      body = {
        name: node.name,
        method: cipher === 'chacha20-ietf-poly1305' ? 'chacha20-poly1305' : cipher,
        server: node.server,
        port: node.port,
        password: node.password,
        tfo,
        udp_relay: node.udp,
        shadow_tls: getShadowTls(node),
      };
      if (node.plugin) {
        if (node.plugin === 'obfs') {
          const mode = node['plugin-opts']?.mode;
          if (mode && mode !== 'http' && mode !== 'tls') {
            throw new Error(`Egern does not support obfs mode "${mode}"`);
          }
          body.obfs = mode;
          body.obfs_host = node['plugin-opts']?.host;
          body.obfs_uri = node['plugin-opts']?.path;
        } else if (node.plugin !== 'shadow-tls') {
          throw new Error(`Egern does not support ss plugin "${node.plugin}"`);
        }
      }
      break;
    }
    case 'trojan': {
      if (node.network && !['tcp', 'ws', 'http'].includes(node.network)) {
        throw new Error(`Egern does not support trojan network "${node.network}"`);
      }
      egernType = 'trojan';
      body = {
        name: node.name,
        server: node.server,
        port: node.port,
        password: node.password,
        tfo,
        udp_relay: node.udp,
        sni,
        skip_tls_verify: node['skip-cert-verify'],
        reality: getReality(node),
        fingerprint_sha256: fingerprint,
        shadow_tls: getShadowTls(node),
        websocket:
          node.network === 'ws'
            ? {
                path: node['ws-opts']?.path,
                host: node['ws-opts']?.headers?.Host,
              }
            : undefined,
      };
      break;
    }
    case 'anytls': {
      egernType = 'anytls';
      body = {
        name: node.name,
        server: node.server,
        port: node.port,
        password: node.password,
        tfo,
        udp_relay: node.udp,
        sni,
        skip_tls_verify: node['skip-cert-verify'],
        reality: getReality(node),
        fingerprint_sha256: fingerprint,
        shadow_tls: getShadowTls(node),
      };
      break;
    }
    case 'hysteria2': {
      egernType = 'hysteria2';
      const upMatch = node.up != null ? `${node.up}`.match(/\d+/)?.[0] : undefined;
      body = {
        name: node.name,
        server: node.server,
        port: node.port,
        auth: node.password,
        bandwidth: upMatch ? Number.parseInt(upMatch, 10) : undefined,
        tfo,
        udp_relay: node.udp,
        sni,
        skip_tls_verify: node['skip-cert-verify'],
        port_hopping: node.ports,
        port_hopping_interval: node['hop-interval'],
        fingerprint_sha256: fingerprint,
        ...(node.obfs === 'salamander' && node['obfs-password']
          ? { obfs: 'salamander', obfs_password: node['obfs-password'] }
          : {}),
      };
      break;
    }
    case 'tuic': {
      if (node.token) {
        throw new Error('Egern only supports TUIC v5 (uuid/password)');
      }
      egernType = 'tuic';
      body = {
        name: node.name,
        server: node.server,
        port: node.port,
        uuid: node.uuid,
        password: node.password,
        sni,
        alpn: Array.isArray(node.alpn) ? node.alpn : [node.alpn ?? 'h3'],
        skip_tls_verify: node['skip-cert-verify'],
        port_hopping: node.ports,
        port_hopping_interval: node['hop-interval'],
        fingerprint_sha256: fingerprint,
      };
      break;
    }
    case 'vmess': {
      egernType = 'vmess';
      const legacy = node.aead === false || (node.alterId !== undefined && node.alterId !== 0);
      body = {
        name: node.name,
        server: node.server,
        port: node.port,
        user_id: node.uuid,
        security: node.cipher || 'auto',
        tfo,
        legacy,
        udp_relay: node.udp,
        transport: getTransport(node, false),
        shadow_tls: getShadowTls(node),
      };
      break;
    }
    case 'vless': {
      if (node.flow && node.flow !== 'xtls-rprx-vision') {
        throw new Error(`Egern does not support VLESS flow "${node.flow}"`);
      }
      egernType = 'vless';
      body = {
        name: node.name,
        server: node.server,
        port: node.port,
        user_id: node.uuid,
        tfo,
        udp_relay: node.udp,
        transport: getTransport(node, true),
        flow: node.flow || undefined,
        shadow_tls: getShadowTls(node),
      };
      break;
    }
    case 'wireguard': {
      egernType = 'wireguard';
      const dnsServers = Array.isArray(node.dns)
        ? node.dns
        : typeof node.dns === 'string'
          ? node.dns
              .split(/\s*,\s*/)
              .map((item) => item.trim())
              .filter(Boolean)
          : undefined;
      body = {
        name: node.name,
        local_ipv4: withCidr(node.ip, 32),
        local_ipv6: withCidr(node.ipv6, 128),
        server: node.server,
        port: node.port,
        private_key: node['private-key'],
        peer_public_key: node['public-key'],
        preshared_key: node['pre-shared-key'],
        reserved: Array.isArray(node.reserved) ? node.reserved : undefined,
        dns_servers: dnsServers,
        mtu: node.mtu,
        keepalive: node.keepalive,
      };
      break;
    }
    case 'snell': {
      egernType = 'snell';
      const version = node.version !== undefined ? Number(node.version) : undefined;
      if (version !== undefined && (version < 1 || version > 5 || !Number.isInteger(version))) {
        throw new Error(`Egern does not support snell version "${node.version}"`);
      }
      body = {
        name: node.name,
        server: node.server,
        port: node.port,
        psk: node.psk,
        version,
        ...(version === undefined || version >= 3 ? { udp_relay: node.udp } : {}),
        obfs: node['obfs-opts']?.mode ?? node.obfs,
        obfs_host: node['obfs-opts']?.host,
        tfo,
        shadow_tls: getShadowTls(node),
      };
      break;
    }
    default:
      throw new Error(`Egern does not support ${node.type}`);
  }

  return {
    [egernType]: stripUndefined({
      ...body,
      ip_version: ipVersion,
      prev_hop: prevHop,
    }),
  };
}

export function produceEgern(nodes: ProxyNode[]): string {
  const proxies = nodes.map(toEgernObject);
  return stringifyYaml({ proxies });
}
