import type { ProxyNode } from '@subhub/shared';
import { quoteIfNeeded, quoteText } from '../text.js';
import { splitList } from '../util.js';

function sanitizeName(value: string): string {
  return value.replace(/[=,]/g, '').trim();
}

function append(base: string, params: Record<string, string | undefined>): string {
  let result = base;
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === '') continue;
    result += `,${key}=${value}`;
  }
  return result;
}

function transport(node: ProxyNode): Record<string, string | undefined> {
  if (!node.network || node.network === 'tcp') return {};
  if (node.network === 'ws') {
    const path = node['ws-opts']?.path;
    const host = node['ws-opts']?.headers?.Host;
    return {
      transport: 'ws',
      path: path ? quoteIfNeeded(path) : undefined,
      host: host ? quoteIfNeeded(host) : undefined,
    };
  }
  if (node.network === 'http') {
    const path = Array.isArray(node['http-opts']?.path)
      ? node['http-opts']?.path[0]
      : node['http-opts']?.path;
    const host = Array.isArray(node['http-opts']?.headers?.Host)
      ? node['http-opts']?.headers?.Host[0]
      : node['http-opts']?.headers?.Host;
    return {
      transport: 'http',
      path: path ? quoteIfNeeded(path) : undefined,
      host: host ? quoteIfNeeded(host) : undefined,
    };
  }
  throw new Error(`Loon does not support transport ${node.network}`);
}

function tls(node: ProxyNode): Record<string, string | undefined> {
  const reality = node['reality-opts'];
  const alpn = splitList(node.alpn);
  return {
    'over-tls': node.tls ? 'true' : undefined,
    'tls-name': node.sni ? quoteIfNeeded(node.sni) : undefined,
    'skip-cert-verify': node['skip-cert-verify'] ? 'true' : undefined,
    alpn: alpn ? quoteText(alpn.join(',')) : undefined,
    'public-key': reality ? quoteText(`${reality['public-key'] ?? ''}`) : undefined,
    'short-id': reality?.['short-id'] ? quoteIfNeeded(reality['short-id']) : undefined,
  };
}

function common(node: ProxyNode): Record<string, string | undefined> {
  return {
    'fast-open': node.tfo ? 'true' : undefined,
    udp: node.udp ? 'true' : undefined,
    'block-quic': node['block-quic'] === 'on' ? 'true' : undefined,
    'ip-mode': node['ip-version'],
  };
}

function shadowsocks(node: ProxyNode): string {
  const base = `${sanitizeName(node.name)}=shadowsocks,${node.server},${node.port},${
    node.cipher ?? 'none'
  },${quoteText(node.password ?? '')}`;
  const params: Record<string, string | undefined> = { ...common(node) };
  if (node.plugin === 'obfs') {
    params['obfs-name'] = node['plugin-opts']?.mode ?? 'http';
    params['obfs-host'] = node['plugin-opts']?.host
      ? quoteIfNeeded(node['plugin-opts'].host)
      : undefined;
    params['obfs-uri'] = node['plugin-opts']?.path
      ? quoteIfNeeded(node['plugin-opts'].path)
      : undefined;
  } else if (node.plugin === 'shadow-tls') {
    params['shadow-tls-password'] = node['plugin-opts']?.password
      ? quoteText(node['plugin-opts'].password)
      : undefined;
    params['shadow-tls-sni'] = node['plugin-opts']?.host
      ? quoteIfNeeded(node['plugin-opts'].host)
      : undefined;
    params['shadow-tls-version'] = node['plugin-opts']?.version
      ? `${node['plugin-opts'].version}`
      : undefined;
  } else if (node.plugin) {
    throw new Error(`Loon does not support Shadowsocks plugin ${node.plugin}`);
  }
  return append(base, params);
}

function vmess(node: ProxyNode): string {
  const base = `${sanitizeName(node.name)}=vmess,${node.server},${node.port},${
    node.cipher || 'auto'
  },${quoteText(node.uuid ?? '')}`;
  return append(base, {
    ...transport(node),
    ...tls(node),
    alterId: `${node.aead ? 0 : (node.alterId ?? 0)}`,
    ...common(node),
  });
}

function vless(node: ProxyNode): string {
  if (node.flow && node.flow !== 'xtls-rprx-vision') {
    throw new Error(`Loon does not support VLESS flow ${node.flow}`);
  }
  const base = `${sanitizeName(node.name)}=vless,${node.server},${node.port},${quoteText(
    node.uuid ?? '',
  )}`;
  return append(base, {
    ...transport(node),
    ...tls(node),
    flow: node.flow || undefined,
    ...common(node),
  });
}

function trojan(node: ProxyNode): string {
  const base = `${sanitizeName(node.name)}=trojan,${node.server},${node.port},${quoteText(
    node.password ?? '',
  )}`;
  return append(base, {
    ...transport(node),
    ...tls(node),
    ...common(node),
  });
}

function hysteria2(node: ProxyNode): string {
  const base = `${sanitizeName(node.name)}=Hysteria2,${node.server},${node.port},${quoteText(
    node.password ?? '',
  )}`;
  const params: Record<string, string | undefined> = {
    ...tls(node),
    ...common(node),
    'server-ports': node.ports ? quoteText(node.ports) : undefined,
    'download-bandwidth': node.down ? `${node.down}`.match(/\d+/)?.[0] : undefined,
  };
  if (node['obfs-password']) {
    if (node.obfs !== 'salamander') throw new Error('Loon only supports salamander obfs');
    params['salamander-password'] = quoteText(node['obfs-password']);
  }
  return append(base, params);
}

function anytls(node: ProxyNode): string {
  if (node.network && node.network !== 'tcp') {
    throw new Error(`Loon does not support AnyTLS transport ${node.network}`);
  }
  const base = `${sanitizeName(node.name)}=anytls,${node.server},${node.port},${quoteText(
    node.password ?? '',
  )}`;
  return append(base, { ...tls(node), ...common(node) });
}

function http(node: ProxyNode): string {
  const type = node.tls ? 'https' : 'http';
  const base = `${sanitizeName(node.name)}=${type},${node.server},${node.port}`;
  return append(base, {
    username: node.username ? quoteIfNeeded(node.username) : undefined,
    password: node.password ? quoteText(node.password) : undefined,
    ...tls(node),
    ...common(node),
  });
}

function socks5(node: ProxyNode): string {
  const base = `${sanitizeName(node.name)}=socks5,${node.server},${node.port}`;
  return append(base, {
    username: node.username ? quoteIfNeeded(node.username) : undefined,
    password: node.password ? quoteText(node.password) : undefined,
    ...tls(node),
    ...common(node),
  });
}

export function produceLoonProxy(node: ProxyNode): string {
  switch (node.type) {
    case 'ss':
      return shadowsocks(node);
    case 'vmess':
      return vmess(node);
    case 'vless':
      return vless(node);
    case 'trojan':
      return trojan(node);
    case 'hysteria2':
      return hysteria2(node);
    case 'anytls':
      return anytls(node);
    case 'http':
      return http(node);
    case 'socks5':
      return socks5(node);
    default:
      throw new Error(`Loon does not support proxy type ${node.type}`);
  }
}

export function produceLoon(nodes: ProxyNode[]): string {
  return nodes.map(produceLoonProxy).join('\n');
}
