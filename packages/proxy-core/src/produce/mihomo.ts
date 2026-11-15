import type { ProxyNode } from '@subhub/shared';
import { stringify as stringifyYaml } from 'yaml';

type Dict = Record<string, unknown>;

function clean(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(clean);
  if (value && typeof value === 'object') {
    const result: Dict = {};
    for (const [key, item] of Object.entries(value as Dict)) {
      if (item === undefined) continue;
      if (key.startsWith('_')) continue;
      result[key] = clean(item);
    }
    return result;
  }
  return value;
}

function withCidr(value: unknown, fallback: string): string | undefined {
  if (value == null || value === '') return undefined;
  const text = `${value}`;
  return text.includes('/') ? text : `${text}${fallback}`;
}

function normalizeForMihomo(node: ProxyNode): Dict {
  const proxy = clean(node) as Dict;
  delete proxy.aead;

  if (node.type === 'vmess') {
    if (node.sni) proxy.servername = node.sni;
    delete proxy.sni;
    proxy.cipher = node.cipher || 'auto';
    proxy.alterId = node.alterId ?? 0;
  }
  if (node.type === 'vless') {
    if (node.sni) proxy.servername = node.sni;
    delete proxy.sni;
  }
  if (node.type === 'trojan') {
    proxy.tls = node.tls ?? true;
  }
  if (node.type === 'tuic') {
    if (node.alpn && !Array.isArray(proxy.alpn)) {
      proxy.alpn = [`${proxy.alpn}`];
    }
    if (node.tfo && proxy['fast-open'] == null) proxy['fast-open'] = true;
    if (!node.token && node.version == null) proxy.version = 5;
  }
  if (node.type === 'anytls') {
    if (node.reuse === false) {
      proxy['disable-reuse'] = true;
      delete proxy.reuse;
    }
  }
  if (node.type === 'wireguard') {
    proxy.ip = withCidr(node.ip, '/32');
    proxy.ipv6 = withCidr(node.ipv6, '/128');
    if (node['pre-shared-key'] && !proxy['preshared-key']) {
      proxy['preshared-key'] = node['pre-shared-key'];
    }
    delete proxy['pre-shared-key'];
    if (node.keepalive && proxy['persistent-keepalive'] == null) {
      proxy['persistent-keepalive'] = node.keepalive;
    }
  }
  if (node.type === 'snell') {
    if (!proxy.psk && node.password) proxy.psk = node.password;
  }
  if (node.type === 'ss') {
    proxy.cipher = node.cipher || 'none';
  }
  if (proxy.network === 'tcp') delete proxy.network;
  if (proxy.network === 'httpupgrade') {
    proxy.network = 'ws';
    proxy['ws-opts'] = {
      ...(proxy['ws-opts'] && typeof proxy['ws-opts'] === 'object'
        ? (proxy['ws-opts'] as Dict)
        : {}),
      'v2ray-http-upgrade': true,
    };
  }
  return proxy;
}

export function toMihomoObject(node: ProxyNode): Dict {
  return normalizeForMihomo(node);
}

export function produceMihomo(nodes: ProxyNode[]): string {
  return stringifyYaml({ proxies: nodes.map(toMihomoObject) });
}

export function produceStash(nodes: ProxyNode[]): string {
  return produceMihomo(nodes);
}

export function produceJson(nodes: ProxyNode[]): string {
  return JSON.stringify(
    nodes.map((node) => clean(node)),
    null,
    2,
  );
}
