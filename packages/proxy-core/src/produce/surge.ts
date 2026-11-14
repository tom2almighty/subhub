import type { ProxyNode } from '@subhub/shared';
import { quoteIfNeeded, quoteText, unquoteText } from '../text.js';
import { splitList } from '../util.js';

function sanitizeName(value: string): string {
  return value.replace(/[=,]/g, '').trim();
}

function bool(value: boolean | undefined): string | undefined {
  return value == null ? undefined : `${value}`;
}

function append(base: string, params: Record<string, string | undefined>): string {
  let result = base;
  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === '') continue;
    result += `,${key}=${value}`;
  }
  return result;
}

function headerString(headers: Record<string, string> | undefined): string | undefined {
  if (!headers) return undefined;
  const pairs: string[] = [];
  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === 'string' && value !== '') pairs.push(`${key}:${unquoteText(value)}`);
  }
  return pairs.length > 0 ? quoteText(pairs.join('|')) : undefined;
}

function wsParams(node: ProxyNode): Record<string, string | undefined> {
  const opts = node['ws-opts'];
  if (!node.network || node.network === 'tcp') return {};
  if (node.network !== 'ws') {
    throw new Error(`Surge does not support network ${node.network}`);
  }
  if (opts?.['v2ray-http-upgrade']) {
    throw new Error('Surge does not support WebSocket http-upgrade');
  }
  const host = opts?.headers?.Host;
  return {
    ws: 'true',
    'ws-path': typeof opts?.path === 'string' ? quoteIfNeeded(opts.path) : undefined,
    'ws-headers': host ? quoteText(`Host:${unquoteText(host)}`) : undefined,
  };
}

function grpcParams(node: ProxyNode): Record<string, string | undefined> {
  if (node.network !== 'grpc') return {};
  const opts = node['grpc-opts'];
  const serviceName = opts?.['grpc-service-name'];
  const mode = opts?.['grpc-mode'];
  const authority = opts?.['grpc-authority'];
  return {
    grpc: 'true',
    'grpc-service-name': serviceName ? quoteIfNeeded(serviceName) : undefined,
    'grpc-mode': mode ? quoteIfNeeded(`${mode}`) : undefined,
    'grpc-authority': authority ? quoteIfNeeded(`${authority}`) : undefined,
  };
}

function xhttpParams(node: ProxyNode): Record<string, string | undefined> {
  if (node.network !== 'xhttp') return {};
  const opts = node['xhttp-opts'];
  const rawHost = opts?.host ?? opts?.headers?.Host ?? opts?.headers?.host;
  const host = Array.isArray(rawHost) ? rawHost[0] : rawHost;
  return {
    xhttp: 'true',
    'xhttp-path': typeof opts?.path === 'string' ? quoteIfNeeded(opts.path) : undefined,
    'xhttp-host': host ? quoteIfNeeded(`${host}`) : undefined,
    'xhttp-mode': opts?.mode ? quoteIfNeeded(`${opts.mode}`) : undefined,
    'xhttp-headers': headerString(opts?.headers),
  };
}

function tlsParams(node: ProxyNode, includeTls = true): Record<string, string | undefined> {
  const reality = node['reality-opts'];
  const alpn = splitList(node.alpn);
  return {
    tls: reality ? undefined : includeTls ? bool(node.tls) : undefined,
    sni: node.sni ? quoteIfNeeded(node.sni) : undefined,
    'skip-cert-verify': bool(node['skip-cert-verify']),
    alpn: alpn ? quoteText(alpn.join(',')) : undefined,
    'reality-public-key': reality?.['public-key'] || undefined,
    'reality-short-id': reality?.['short-id'] || undefined,
  };
}

function commonParams(node: ProxyNode): Record<string, string | undefined> {
  return {
    'udp-relay': bool(node.udp),
    tfo: bool(node.tfo),
  };
}

function shadowsocks(node: ProxyNode): string {
  const base = `${sanitizeName(node.name)}=ss,${node.server},${node.port}`;
  const params: Record<string, string | undefined> = {
    'encrypt-method': node.cipher ?? 'none',
    password: quoteText(node.password ?? ''),
    ...commonParams(node),
  };
  if (node.plugin === 'obfs') {
    params.obfs = node['plugin-opts']?.mode ?? 'http';
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
    throw new Error(`Surge does not support Shadowsocks plugin ${node.plugin}`);
  }
  return append(base, params);
}

function vmess(node: ProxyNode): string {
  const base = `${sanitizeName(node.name)}=vmess,${node.server},${node.port}`;
  if (node.network === 'grpc') {
    throw new Error('Surge VMess does not support gRPC transport');
  }
  return append(base, {
    username: node.uuid ? quoteIfNeeded(node.uuid) : undefined,
    'encrypt-method': node.cipher || 'auto',
    'vmess-aead': `${node.aead ?? node.alterId === 0}`,
    ...wsParams(node),
    ...tlsParams(node),
    ...commonParams(node),
  });
}

function vless(node: ProxyNode): string {
  const base = `${sanitizeName(node.name)}=vless,${node.server},${node.port}`;
  if (node.flow && !['xtls-rprx-vision', 'xtls-rprx-vision-udp443'].includes(node.flow)) {
    throw new Error(`Surge does not support VLESS flow ${node.flow}`);
  }
  if (node.flow && node.network === 'grpc') {
    throw new Error('Surge does not support VLESS Vision over gRPC');
  }
  if (node.flow && !node.tls && !node.encryption) {
    throw new Error('Surge VLESS Vision requires TLS, REALITY or VLESS encryption');
  }
  if (node.flow && (node.network === 'ws' || node.network === 'xhttp') && !node.encryption) {
    throw new Error('Surge VLESS Vision over WebSocket or XHTTP requires VLESS encryption');
  }
  if (node.encryption && /[,"'\r\n]/.test(node.encryption)) {
    throw new Error('Surge VLESS encryption contains unsupported characters');
  }
  if (node.network && !['tcp', 'raw', 'none', 'ws', 'grpc', 'xhttp'].includes(node.network)) {
    throw new Error(`Surge does not support VLESS transport ${node.network}`);
  }
  if (node.network === 'grpc' && !node.tls && !node['reality-opts']) {
    throw new Error('Surge VLESS gRPC requires TLS or REALITY');
  }
  if (node.network === 'ws' && node['reality-opts']) {
    throw new Error('Surge does not support VLESS REALITY over WebSocket');
  }
  const transport =
    node.network === 'grpc'
      ? grpcParams(node)
      : node.network === 'ws'
        ? wsParams(node)
        : node.network === 'xhttp'
          ? xhttpParams(node)
          : {};
  return append(base, {
    username: node.uuid ? quoteIfNeeded(node.uuid) : undefined,
    flow: node.flow || undefined,
    encryption: node.encryption || undefined,
    ...transport,
    ...tlsParams(node),
  });
}

function trojan(node: ProxyNode): string {
  const base = `${sanitizeName(node.name)}=trojan,${node.server},${node.port}`;
  if (node.network && !['tcp', 'ws'].includes(node.network)) {
    throw new Error(`Surge does not support Trojan transport ${node.network}`);
  }
  return append(base, {
    password: quoteText(node.password ?? ''),
    ...wsParams(node),
    ...tlsParams(node, true),
    ...commonParams(node),
  });
}

function hysteria2(node: ProxyNode): string {
  const base = `${sanitizeName(node.name)}=hysteria2,${node.server},${node.port}`;
  const params: Record<string, string | undefined> = {
    password: quoteText(node.password ?? ''),
    ...tlsParams(node, true),
    ...commonParams(node),
    'download-bandwidth': node.down ? `${node.down}`.match(/\d+/)?.[0] : undefined,
    'port-hopping': node.ports?.replace(/,/g, ';'),
  };
  if (node['obfs-password']) {
    if (node.obfs === 'salamander')
      params['salamander-password'] = quoteText(node['obfs-password']);
    else if (node.obfs === 'gecko') params['gecko-password'] = quoteText(node['obfs-password']);
    else throw new Error(`Surge does not support Hysteria2 obfs ${node.obfs}`);
  }
  return append(base, params);
}

function tuic(node: ProxyNode): string {
  const isV5 = node.uuid || node.password;
  const base = `${sanitizeName(node.name)}=${isV5 ? 'tuic-v5' : 'tuic'},${node.server},${node.port}`;
  return append(base, {
    uuid: isV5 ? node.uuid || undefined : undefined,
    password: isV5 ? quoteText(node.password ?? '') : undefined,
    token: isV5 ? undefined : node.token || undefined,
    ...tlsParams(node, true),
    ...commonParams(node),
  });
}

function anytls(node: ProxyNode): string {
  if (node.network && node.network !== 'tcp') {
    throw new Error(`Surge does not support AnyTLS transport ${node.network}`);
  }
  const base = `${sanitizeName(node.name)}=anytls,${node.server},${node.port}`;
  return append(base, {
    password: quoteText(node.password ?? ''),
    ...tlsParams(node, true),
    ...commonParams(node),
  });
}

function snell(node: ProxyNode): string {
  const base = `${sanitizeName(node.name)}=snell,${node.server},${node.port}`;
  return append(base, {
    version: `${node.version ?? 4}`,
    psk: quoteText(node.psk ?? ''),
    obfs: node['obfs-opts']?.mode || undefined,
    'obfs-host': node['obfs-opts']?.host ? quoteIfNeeded(node['obfs-opts'].host) : undefined,
    ...commonParams(node),
  });
}

function http(node: ProxyNode): string {
  const base = `${sanitizeName(node.name)}=${node.tls ? 'https' : 'http'},${node.server},${node.port}`;
  return append(base, {
    username: node.username ? quoteIfNeeded(node.username) : undefined,
    password: node.password ? quoteText(node.password) : undefined,
    sni: node.sni ? quoteIfNeeded(node.sni) : undefined,
    'skip-cert-verify': bool(node['skip-cert-verify']),
    ...commonParams(node),
  });
}

function socks5(node: ProxyNode): string {
  const base = `${sanitizeName(node.name)}=socks5,${node.server},${node.port}`;
  return append(base, {
    username: node.username ? quoteIfNeeded(node.username) : undefined,
    password: node.password ? quoteText(node.password) : undefined,
    ...commonParams(node),
  });
}

export function produceSurgeProxy(node: ProxyNode): string {
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
    case 'tuic':
      return tuic(node);
    case 'anytls':
      return anytls(node);
    case 'snell':
      return snell(node);
    case 'http':
      return http(node);
    case 'socks5':
      return socks5(node);
    default:
      throw new Error(`Surge does not support proxy type ${node.type}`);
  }
}

export function produceSurge(nodes: ProxyNode[]): string {
  return nodes.map(produceSurgeProxy).join('\n');
}
