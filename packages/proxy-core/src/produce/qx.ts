import type { ProxyNode } from '@subhub/shared';
import { quoteIfDelimited } from '../text.js';
import { splitList } from '../util.js';

function append(base: string, params: Record<string, string | undefined>): string {
  let result = base;
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === '') continue;
    result += `,${key}=${value}`;
  }
  return result;
}

function encodeAlpn(alpn: string[] | undefined): string | undefined {
  if (!alpn || alpn.length === 0) return undefined;
  return alpn
    .map((item) => {
      const bytes = Buffer.from(item, 'utf8');
      return `${bytes.length.toString(16).padStart(2, '0')}${bytes.toString('hex')}`;
    })
    .join('');
}

function tlsParams(node: ProxyNode): Record<string, string | undefined> {
  return {
    'over-tls': node.network === 'ws' ? undefined : node.tls ? 'true' : undefined,
    'tls-verification': node['skip-cert-verify'] ? 'false' : undefined,
    'tls-host': node.sni ? quoteIfDelimited(node.sni) : undefined,
    'tls-alpn': encodeAlpn(splitList(node.alpn)),
    'tls-cert-sha256': node['tls-fingerprint'] || undefined,
    'reality-base64-pubkey': node['reality-opts']?.['public-key'] || undefined,
    'reality-hex-shortid': node['reality-opts']?.['short-id'] || undefined,
  };
}

function wsParams(node: ProxyNode): Record<string, string | undefined> {
  if (!node.network || node.network === 'tcp') return {};
  if (node.network === 'ws') {
    const path = node['ws-opts']?.path;
    const host = node['ws-opts']?.headers?.Host;
    return {
      obfs: node.tls ? 'wss' : 'ws',
      'obfs-uri': path ? quoteIfDelimited(path) : undefined,
      'obfs-host': host ? quoteIfDelimited(host) : undefined,
    };
  }
  if (node.network === 'http') {
    const rawPath = node['http-opts']?.path;
    const rawHost = node['http-opts']?.headers?.Host;
    const path = Array.isArray(rawPath) ? rawPath[0] : rawPath;
    const host = Array.isArray(rawHost) ? rawHost[0] : rawHost;
    return {
      obfs: 'http',
      'obfs-uri': path ? quoteIfDelimited(path) : undefined,
      'obfs-host': host ? quoteIfDelimited(host) : undefined,
    };
  }
  throw new Error(`QX does not support transport ${node.network}`);
}

function common(node: ProxyNode): Record<string, string | undefined> {
  return {
    'fast-open': node.tfo ? 'true' : undefined,
    'udp-relay': node.udp ? 'true' : undefined,
    tag: quoteIfDelimited(node.name),
  };
}

function shadowsocks(node: ProxyNode): string {
  const base = `shadowsocks=${node.server}:${node.port}`;
  const params: Record<string, string | undefined> = {
    method: node.cipher ?? 'none',
    password: node.password ? quoteIfDelimited(node.password) : undefined,
    ...common(node),
  };
  if (node.plugin === 'obfs') {
    params.obfs = node['plugin-opts']?.mode ?? 'http';
    params['obfs-host'] = node['plugin-opts']?.host
      ? quoteIfDelimited(node['plugin-opts'].host)
      : undefined;
    params['obfs-uri'] = node['plugin-opts']?.path
      ? quoteIfDelimited(node['plugin-opts'].path)
      : undefined;
  } else if (node.plugin === 'v2ray-plugin') {
    params.obfs = node['plugin-opts']?.tls ? 'wss' : 'ws';
    params['obfs-host'] = node['plugin-opts']?.host
      ? quoteIfDelimited(node['plugin-opts'].host)
      : undefined;
    params['obfs-uri'] = node['plugin-opts']?.path
      ? quoteIfDelimited(node['plugin-opts'].path)
      : undefined;
  } else if (node.plugin) {
    throw new Error(`QX does not support Shadowsocks plugin ${node.plugin}`);
  }
  return append(base, params);
}

function vmess(node: ProxyNode): string {
  const base = `vmess=${node.server}:${node.port}`;
  return append(base, {
    method: node.cipher || 'auto',
    password: node.uuid ? quoteIfDelimited(node.uuid) : undefined,
    ...wsParams(node),
    ...(node.network !== 'ws' && node.tls ? { obfs: 'over-tls' } : {}),
    ...tlsParams(node),
    aead: `${node.aead ?? node.alterId === 0}`,
    ...common(node),
  });
}

function vless(node: ProxyNode): string {
  if (node.flow && node.flow !== 'xtls-rprx-vision') {
    throw new Error(`QX does not support VLESS flow ${node.flow}`);
  }
  const base = `vless=${node.server}:${node.port}`;
  return append(base, {
    method: 'none',
    password: node.uuid ? quoteIfDelimited(node.uuid) : undefined,
    ...wsParams(node),
    ...(node.network !== 'ws' && node.tls ? { obfs: 'over-tls' } : {}),
    ...tlsParams(node),
    'vless-flow': node.flow || undefined,
    ...common(node),
  });
}

function trojan(node: ProxyNode): string {
  const base = `trojan=${node.server}:${node.port}`;
  return append(base, {
    password: node.password ? quoteIfDelimited(node.password) : undefined,
    ...wsParams(node),
    ...(node.network !== 'ws' && node.tls ? { obfs: 'over-tls' } : {}),
    ...tlsParams(node),
    ...common(node),
  });
}

function anytls(node: ProxyNode): string {
  if (node.network && node.network !== 'tcp') {
    throw new Error(`QX does not support AnyTLS transport ${node.network}`);
  }
  const base = `anytls=${node.server}:${node.port}`;
  return append(base, {
    password: node.password ? quoteIfDelimited(node.password) : undefined,
    'over-tls': 'true',
    ...tlsParams(node),
    ...common(node),
  });
}

function http(node: ProxyNode): string {
  const base = `http=${node.server}:${node.port}`;
  return append(base, {
    username: node.username ? quoteIfDelimited(node.username) : undefined,
    password: node.password ? quoteIfDelimited(node.password) : undefined,
    ...(node.tls ? { 'over-tls': 'true' } : {}),
    ...tlsParams(node),
    ...common(node),
  });
}

function socks5(node: ProxyNode): string {
  const base = `socks5=${node.server}:${node.port}`;
  return append(base, {
    username: node.username ? quoteIfDelimited(node.username) : undefined,
    password: node.password ? quoteIfDelimited(node.password) : undefined,
    ...(node.tls ? { 'over-tls': 'true' } : {}),
    ...tlsParams(node),
    ...common(node),
  });
}

export function produceQxProxy(node: ProxyNode): string {
  switch (node.type) {
    case 'ss':
      return shadowsocks(node);
    case 'vmess':
      return vmess(node);
    case 'vless':
      return vless(node);
    case 'trojan':
      return trojan(node);
    case 'anytls':
      return anytls(node);
    case 'http':
      return http(node);
    case 'socks5':
      return socks5(node);
    default:
      throw new Error(`QX does not support proxy type ${node.type}`);
  }
}

export function produceQx(nodes: ProxyNode[]): string {
  return nodes.map(produceQxProxy).join('\n');
}
