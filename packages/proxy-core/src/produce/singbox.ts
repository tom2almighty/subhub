import type { ProxyNode } from '@subhub/shared';
import { splitList } from '../util.js';

type Dict = Record<string, unknown>;

function clean(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(clean);
  if (value && typeof value === 'object') {
    const result: Dict = {};
    for (const [key, item] of Object.entries(value as Dict)) {
      if (item === undefined) continue;
      result[key] = clean(item);
    }
    return result;
  }
  return value;
}

function tls(node: ProxyNode): Dict | undefined {
  if (!node.tls && !node['reality-opts']) return undefined;
  const result: Dict = { enabled: true };
  if (node.sni) result.server_name = node.sni;
  if (node['skip-cert-verify']) result.insecure = true;
  const alpn = splitList(node.alpn);
  if (alpn) result.alpn = alpn;
  if (node['reality-opts']) {
    result.reality = {
      enabled: true,
      public_key: node['reality-opts']['public-key'],
      short_id: node['reality-opts']['short-id'],
    };
  }
  return result;
}

function transport(node: ProxyNode): Dict | undefined {
  if (!node.network || node.network === 'tcp') return undefined;
  if (node.network === 'ws' || node.network === 'httpupgrade') {
    const headers = node['ws-opts']?.headers;
    return {
      type:
        node.network === 'httpupgrade' || node['ws-opts']?.['v2ray-http-upgrade']
          ? 'httpupgrade'
          : 'ws',
      path: node['ws-opts']?.path,
      headers,
    };
  }
  if (node.network === 'grpc') {
    return {
      type: 'grpc',
      service_name: node['grpc-opts']?.['grpc-service-name'],
    };
  }
  if (node.network === 'h2' || node.network === 'http') {
    return {
      type: 'http',
      path: node['h2-opts']?.path ?? node['http-opts']?.path ?? node['ws-opts']?.path,
      host: node['h2-opts']?.host ?? node['http-opts']?.headers?.Host,
    };
  }
  throw new Error(`sing-box does not support transport ${node.network}`);
}

function pluginOptions(node: ProxyNode): Dict | undefined {
  if (!node.plugin) return undefined;
  const opts = node['plugin-opts'];
  if (node.plugin === 'obfs') {
    return {
      plugin: 'obfs-local',
      plugin_opts: `obfs=${opts?.mode ?? 'http'}${opts?.host ? `;obfs-host=${opts.host}` : ''}`,
    };
  }
  if (node.plugin === 'v2ray-plugin') {
    const parts = [`mode=${opts?.mode ?? 'websocket'}`];
    if (opts?.tls) parts.push('tls');
    if (opts?.host) parts.push(`host=${opts.host}`);
    if (opts?.path) parts.push(`path=${opts.path}`);
    return { plugin: 'v2ray-plugin', plugin_opts: parts.join(';') };
  }
  throw new Error(`sing-box does not support Shadowsocks plugin ${node.plugin}`);
}

function base(node: ProxyNode, type: string): Dict {
  return {
    type,
    tag: node.name,
    server: node.server,
    server_port: node.port,
    tcp_fast_open: node.tfo || undefined,
  };
}

function toOutbound(node: ProxyNode): Dict {
  switch (node.type) {
    case 'ss':
      return {
        ...base(node, 'shadowsocks'),
        method: node.cipher ?? 'none',
        password: node.password,
        ...pluginOptions(node),
      };
    case 'vmess':
      return {
        ...base(node, 'vmess'),
        uuid: node.uuid,
        security: node.cipher || 'auto',
        alter_id: node.aead ? 0 : (node.alterId ?? 0),
        tls: tls(node),
        transport: transport(node),
      };
    case 'vless':
      return {
        ...base(node, 'vless'),
        uuid: node.uuid,
        flow: node.flow || undefined,
        tls: tls(node),
        transport: transport(node),
      };
    case 'trojan':
      return {
        ...base(node, 'trojan'),
        password: node.password,
        tls: tls(node) ?? { enabled: true },
        transport: transport(node),
      };
    case 'hysteria2':
      return {
        ...base(node, 'hysteria2'),
        password: node.password,
        obfs: node.obfs ? { type: node.obfs, password: node['obfs-password'] } : undefined,
        tls: tls(node) ?? { enabled: true },
        up_mbps: node.up ? Number.parseInt(`${node.up}`, 10) : undefined,
        down_mbps: node.down ? Number.parseInt(`${node.down}`, 10) : undefined,
      };
    case 'tuic':
      return {
        ...base(node, 'tuic'),
        uuid: node.uuid,
        password: node.password,
        congestion_control: node['congestion-controller'],
        udp_relay_mode: node['udp-relay-mode'],
        tls: tls(node) ?? { enabled: true },
      };
    case 'anytls':
      return {
        ...base(node, 'anytls'),
        password: node.password,
        tls: tls(node) ?? { enabled: true },
      };
    case 'wireguard':
      return {
        ...base(node, 'wireguard'),
        private_key: node['private-key'],
        local_address: [node.ip, node.ipv6].filter(Boolean),
        mtu: node.mtu,
        peers: [
          {
            server: node.server,
            server_port: node.port,
            public_key: node['public-key'],
            pre_shared_key: node['pre-shared-key'] ?? node['preshared-key'],
            reserved: node.reserved,
          },
        ],
      };
    case 'http':
      return {
        ...base(node, 'http'),
        username: node.username,
        password: node.password,
        tls: tls(node),
      };
    case 'socks5':
      return {
        ...base(node, 'socks'),
        version: '5',
        username: node.username,
        password: node.password,
      };
    default:
      throw new Error(`sing-box does not support proxy type ${node.type}`);
  }
}

export function produceSingboxOutbound(node: ProxyNode): Dict {
  return clean(toOutbound(node)) as Dict;
}

export function produceSingbox(nodes: ProxyNode[]): string {
  return JSON.stringify(
    {
      outbounds: [
        ...nodes.map((node) => produceSingboxOutbound(node)),
        { type: 'direct', tag: 'direct' },
      ],
    },
    null,
    2,
  );
}
