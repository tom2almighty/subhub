import type { ProxyNode } from '@subhub/shared';
import { encodeBase64, formatHost, splitList } from '../util.js';

function nameOf(node: ProxyNode): string {
  return encodeURIComponent(node.name);
}

function hostOf(node: ProxyNode): string {
  return formatHost(node.server ?? '');
}

function query(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value != null && value !== '') search.set(key, value);
  }
  const result = search.toString();
  return result ? `?${result}` : '';
}

function firstPath(
  node: ProxyNode,
  key: 'ws-opts' | 'xhttp-opts' | 'h2-opts' | 'http-opts',
): string | undefined {
  const value = node[key]?.path;
  if (Array.isArray(value)) return value[0] == null ? undefined : `${value[0]}`;
  return value == null ? undefined : `${value}`;
}

function transportQuery(node: ProxyNode): Record<string, string | undefined> {
  const network = `${node.network ?? 'tcp'}`;
  const params: Record<string, string | undefined> = { type: network };
  if (network === 'ws') {
    params.path = firstPath(node, 'ws-opts');
    params.host = node['ws-opts']?.headers?.Host;
  } else if (network === 'grpc') {
    params.serviceName = node['grpc-opts']?.['grpc-service-name'];
    params.mode = node['grpc-opts']?.['grpc-mode'];
  } else if (network === 'xhttp') {
    const opts = node['xhttp-opts'];
    const host = opts?.host ?? opts?.headers?.Host;
    params.path = firstPath(node, 'xhttp-opts');
    params.host = Array.isArray(host) ? host[0] : host;
    params.mode = opts?.mode;
  } else if (network === 'h2' || network === 'http') {
    params.path = firstPath(node, 'h2-opts') ?? firstPath(node, 'http-opts');
    const host = node['h2-opts']?.host ?? node['http-opts']?.headers?.Host;
    params.host = Array.isArray(host) ? host[0] : host;
  }
  return params;
}

function securityQuery(node: ProxyNode): Record<string, string | undefined> {
  const params: Record<string, string | undefined> = {};
  if (node['reality-opts']) {
    params.security = 'reality';
    params.pbk = `${node['reality-opts']['public-key'] ?? ''}`;
    params.sid = `${node['reality-opts']['short-id'] ?? ''}`;
  } else if (node.tls) {
    params.security = 'tls';
  }
  if (node.sni) params.sni = node.sni;
  if (node.alpn) params.alpn = splitList(node.alpn)?.join(',');
  if (node['client-fingerprint']) params.fp = `${node['client-fingerprint']}`;
  if (node['skip-cert-verify']) params.allowInsecure = '1';
  return params;
}

function ssUri(node: ProxyNode): string {
  const credentials = encodeBase64(`${node.cipher ?? 'none'}:${node.password ?? ''}`);
  const pluginParts: string[] = [];
  if (node.plugin === 'obfs') {
    pluginParts.push('obfs-local', `obfs=${node['plugin-opts']?.mode ?? 'http'}`);
    if (node['plugin-opts']?.host) pluginParts.push(`obfs-host=${node['plugin-opts'].host}`);
  } else if (node.plugin === 'v2ray-plugin') {
    pluginParts.push('v2ray-plugin', `mode=${node['plugin-opts']?.mode ?? 'websocket'}`);
    if (node['plugin-opts']?.tls) pluginParts.push('tls');
    if (node['plugin-opts']?.host) pluginParts.push(`host=${node['plugin-opts'].host}`);
    if (node['plugin-opts']?.path) pluginParts.push(`path=${node['plugin-opts'].path}`);
  }
  const params =
    pluginParts.length > 0 ? `?plugin=${encodeURIComponent(pluginParts.join(';'))}` : '';
  return `ss://${credentials}@${hostOf(node)}:${node.port}${params}#${nameOf(node)}`;
}

function vmessUri(node: ProxyNode): string {
  const payload: Record<string, unknown> = {
    v: '2',
    ps: node.name,
    add: node.server,
    port: `${node.port}`,
    id: node.uuid ?? '',
    aid: node.alterId ?? 0,
    scy: node.cipher ?? 'auto',
    net: node.network ?? 'tcp',
    type: 'none',
    host: '',
    path: '',
    tls: '',
    sni: '',
    alpn: '',
    fp: '',
  };
  const network = `${node.network ?? 'tcp'}`;
  if (network === 'ws') {
    payload.path = firstPath(node, 'ws-opts') ?? '/';
    payload.host = node['ws-opts']?.headers?.Host ?? '';
  } else if (network === 'grpc') {
    payload.path = node['grpc-opts']?.['grpc-service-name'] ?? '';
  } else if (network === 'h2' || network === 'http') {
    payload.path = firstPath(node, 'h2-opts') ?? firstPath(node, 'http-opts') ?? '/';
    const host = node['h2-opts']?.host ?? node['http-opts']?.headers?.Host;
    payload.host = Array.isArray(host) ? host.join(',') : (host ?? '');
  }
  if (node.tls) payload.tls = 'tls';
  if (node.sni) payload.sni = node.sni;
  if (node.alpn) payload.alpn = splitList(node.alpn)?.join(',') ?? '';
  if (node['client-fingerprint']) payload.fp = node['client-fingerprint'];
  return `vmess://${encodeBase64(JSON.stringify(payload))}`;
}

function vlessUri(node: ProxyNode): string {
  const params: Record<string, string | undefined> = {
    encryption: node.encryption ?? 'none',
    ...securityQuery(node),
    ...transportQuery(node),
  };
  if (node.flow) params.flow = node.flow;
  return `vless://${encodeURIComponent(node.uuid ?? '')}@${hostOf(node)}:${node.port}${query(
    params,
  )}#${nameOf(node)}`;
}

function trojanUri(node: ProxyNode): string {
  const params = {
    ...securityQuery(node),
    ...transportQuery(node),
  };
  return `trojan://${encodeURIComponent(node.password ?? '')}@${hostOf(node)}:${node.port}${query(
    params,
  )}#${nameOf(node)}`;
}

function hysteria2Uri(node: ProxyNode): string {
  const params = {
    sni: node.sni,
    insecure: node['skip-cert-verify'] ? '1' : undefined,
    obfs: node.obfs,
    'obfs-password': node['obfs-password'],
    up: node.up,
    down: node.down,
    ports: node.ports,
    alpn: splitList(node.alpn)?.join(','),
  };
  return `hysteria2://${encodeURIComponent(node.password ?? '')}@${hostOf(node)}:${node.port}${query(
    params,
  )}#${nameOf(node)}`;
}

function tuicUri(node: ProxyNode): string {
  const params = {
    sni: node.sni,
    alpn: splitList(node.alpn)?.join(','),
    congestion_control: node['congestion-controller'],
    udp_relay_mode: node['udp-relay-mode'],
    allow_insecure: node['skip-cert-verify'] ? '1' : undefined,
  };
  const auth = `${encodeURIComponent(node.uuid ?? '')}:${encodeURIComponent(node.password ?? '')}`;
  return `tuic://${auth}@${hostOf(node)}:${node.port}${query(params)}#${nameOf(node)}`;
}

function anytlsUri(node: ProxyNode): string {
  const params = {
    sni: node.sni,
    insecure: node['skip-cert-verify'] ? '1' : undefined,
    alpn: splitList(node.alpn)?.join(','),
  };
  return `anytls://${encodeURIComponent(node.password ?? '')}@${hostOf(node)}:${node.port}${query(
    params,
  )}#${nameOf(node)}`;
}

function wireguardUri(node: ProxyNode): string {
  const address = [node.ip, node.ipv6].filter(Boolean).join(',');
  const params = {
    publickey: node['public-key'],
    'pre-shared-key': node['pre-shared-key'] ?? node['preshared-key'],
    address,
    mtu: node.mtu == null ? undefined : `${node.mtu}`,
    reserved: node.reserved?.join(','),
  };
  return `wireguard://${encodeURIComponent(node['private-key'] ?? '')}@${hostOf(node)}:${
    node.port
  }${query(params)}#${nameOf(node)}`;
}

function snellUri(node: ProxyNode): string {
  const params = {
    version: `${node.version ?? 4}`,
    obfs: node['obfs-opts']?.mode,
    'obfs-host': node['obfs-opts']?.host,
  };
  return `snell://${encodeURIComponent(node.psk ?? '')}@${hostOf(node)}:${node.port}${query(
    params,
  )}#${nameOf(node)}`;
}

function httpUri(node: ProxyNode): string {
  const scheme = node.tls ? 'https' : 'http';
  const auth =
    node.username || node.password
      ? `${encodeURIComponent(node.username ?? '')}:${encodeURIComponent(node.password ?? '')}@`
      : '';
  return `${scheme}://${auth}${hostOf(node)}:${node.port}#${nameOf(node)}`;
}

function socksUri(node: ProxyNode): string {
  const scheme = node.tls ? 'socks5+tls' : 'socks5';
  const auth =
    node.username || node.password
      ? `${encodeURIComponent(node.username ?? '')}:${encodeURIComponent(node.password ?? '')}@`
      : '';
  return `${scheme}://${auth}${hostOf(node)}:${node.port}#${nameOf(node)}`;
}

export function produceUri(node: ProxyNode): string {
  switch (node.type) {
    case 'ss':
      return ssUri(node);
    case 'vmess':
      return vmessUri(node);
    case 'vless':
      return vlessUri(node);
    case 'trojan':
      return trojanUri(node);
    case 'hysteria2':
      return hysteria2Uri(node);
    case 'tuic':
      return tuicUri(node);
    case 'anytls':
      return anytlsUri(node);
    case 'wireguard':
      return wireguardUri(node);
    case 'snell':
      return snellUri(node);
    case 'http':
      return httpUri(node);
    case 'socks5':
      return socksUri(node);
    default:
      throw new Error(`Unsupported proxy type for URI output: ${node.type}`);
  }
}

export function produceUriList(nodes: ProxyNode[]): string {
  return nodes.map(produceUri).join('\n');
}
