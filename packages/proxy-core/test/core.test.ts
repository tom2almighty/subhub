import type { Processor, ProxyNode } from '@subhub/shared';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import {
  applyFlag,
  applyProcessors,
  parseMihomoYaml,
  parseNodes,
  parseUri,
  produce,
  produceSurgeProxy,
} from '../src/index.js';

const VLESS_REALITY =
  'vless://11111111-2222-3333-4444-555555555555@1.2.3.4:443' +
  '?security=reality&sni=example.com&pbk=PUBKEY&sid=abcd' +
  '&flow=xtls-rprx-vision#HK';

const VLESS_WS =
  'vless://11111111-2222-3333-4444-555555555555@5.6.7.8:443' +
  '?security=tls&sni=example.com&type=ws&path=%2Fws&host=cdn.example.com#WS';

const SS_URI = 'ss://YWVzLTI1Ni1nY206cGFzcw==@1.2.3.4:8388#SS';
const TROJAN_URI = 'trojan://secret@example.com:443?sni=example.com#T';
const HY2_URI =
  'hysteria2://secret@example.com:443?sni=example.com&insecure=1' +
  '&obfs=salamander&obfs-password=xyz#HY';

const MIHOMO_YAML = `
proxies:
  - name: HY2
    type: hysteria2
    server: hy.example.com
    port: 443
    password: pass
    sni: hy.example.com
    skip-cert-verify: true
  - name: SS
    type: ss
    server: ss.example.com
    port: 8388
    cipher: aes-128-gcm
    password: pass
`;

function processor(value: Processor): Processor {
  return value;
}

describe('parseUri', () => {
  it('parses VLESS REALITY with WebSocket', () => {
    const node = parseUri(VLESS_REALITY);
    expect(node).toMatchObject({
      type: 'vless',
      name: 'HK',
      server: '1.2.3.4',
      port: 443,
      uuid: '11111111-2222-3333-4444-555555555555',
      tls: true,
      sni: 'example.com',
      flow: 'xtls-rprx-vision',
    });
    expect(node['reality-opts']).toEqual({ 'public-key': 'PUBKEY', 'short-id': 'abcd' });
  });

  it('parses VLESS WebSocket', () => {
    const node = parseUri(VLESS_WS);
    expect(node).toMatchObject({ type: 'vless', tls: true, network: 'ws' });
    expect(node['ws-opts']).toEqual({ path: '/ws', headers: { Host: 'cdn.example.com' } });
  });

  it('parses VLESS XHTTP with encryption', () => {
    const encryption = 'mlkem768x25519plus.native.0rtt.100-111-1111.AAAA';
    const node = parseUri(
      'vless://11111111-2222-3333-4444-555555555555@example.com:443' +
        '?security=tls&type=xhttp&path=%2Fxhttp%3Fa%3D1%2C2&host=cdn.example.com' +
        `&mode=stream-one&encryption=${encryption}#X`,
    );
    expect(node).toMatchObject({ type: 'vless', network: 'xhttp', tls: true, encryption });
    expect(node['xhttp-opts']).toMatchObject({
      path: '/xhttp?a=1,2',
      host: 'cdn.example.com',
      mode: 'stream-one',
    });
  });

  it('parses Shadowsocks SIP002', () => {
    expect(parseUri(SS_URI)).toMatchObject({
      type: 'ss',
      name: 'SS',
      server: '1.2.3.4',
      port: 8388,
      cipher: 'aes-256-gcm',
      password: 'pass',
    });
  });

  it('parses Trojan and Hysteria2', () => {
    expect(parseUri(TROJAN_URI)).toMatchObject({
      type: 'trojan',
      password: 'secret',
      tls: true,
      sni: 'example.com',
    });
    expect(parseUri(HY2_URI)).toMatchObject({
      type: 'hysteria2',
      password: 'secret',
      tls: true,
      obfs: 'salamander',
      'obfs-password': 'xyz',
      'skip-cert-verify': true,
    });
  });

  it('parses a Base64 VMess payload', () => {
    const payload = Buffer.from(
      JSON.stringify({
        v: '2',
        ps: 'VM',
        add: 'vm.example.com',
        port: '443',
        id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        aid: '0',
        scy: 'auto',
        net: 'ws',
        host: 'cdn.example.com',
        path: '/ws',
        tls: 'tls',
        sni: 'cdn.example.com',
      }),
    ).toString('base64');
    expect(parseUri(`vmess://${payload}`)).toMatchObject({
      type: 'vmess',
      name: 'VM',
      server: 'vm.example.com',
      port: 443,
      tls: true,
      network: 'ws',
    });
  });
});

describe('parseMihomoYaml', () => {
  it('normalizes Mihomo proxies', () => {
    const { nodes, warnings } = parseMihomoYaml(MIHOMO_YAML);
    expect(warnings).toEqual([]);
    expect(nodes).toHaveLength(2);
    expect(nodes[0]).toMatchObject({
      name: 'HY2',
      type: 'hysteria2',
      server: 'hy.example.com',
      port: 443,
      'skip-cert-verify': true,
    });
    expect(nodes[1]).toMatchObject({ name: 'SS', type: 'ss', cipher: 'aes-128-gcm' });
  });

  it('keeps subscription info pseudo-nodes for the filter stage', () => {
    const { nodes } = parseMihomoYaml(
      'proxies:\n  - name: 剩余流量：10GB\n    type: ss\n    server: x\n    port: 1\n',
    );
    expect(nodes).toHaveLength(1);
    expect(nodes[0]?.name).toBe('剩余流量：10GB');
  });
});

describe('produce', () => {
  it('emits Surge VLESS with REALITY fields', () => {
    const line = produceSurgeProxy(parseUri(VLESS_REALITY));
    expect(line).toContain('HK=vless,1.2.3.4,443');
    expect(line).toContain('username=11111111-2222-3333-4444-555555555555');
    expect(line).toContain('flow=xtls-rprx-vision');
    expect(line).toContain('sni=example.com');
    expect(line).toContain('reality-public-key=PUBKEY');
    expect(line).toContain('reality-short-id=abcd');
    expect(line).not.toContain('tls=true');
  });

  it('emits Surge VLESS WebSocket', () => {
    const line = produceSurgeProxy(parseUri(VLESS_WS));
    expect(line).toContain('WS=vless,5.6.7.8,443');
    expect(line).toContain('ws=true');
    expect(line).toContain('ws-path=/ws');
    expect(line).toContain('ws-headers="Host:cdn.example.com"');
    expect(line).toContain('tls=true');
    expect(line).not.toContain('ws-http-upgrade');
  });

  it('emits Surge ws-http-upgrade=true for VLESS, VMess and Trojan HTTPUpgrade', () => {
    const vlessLine = produceSurgeProxy(
      parseUri(
        'vless://11111111-2222-3333-4444-555555555555@5.6.7.8:443?security=tls&sni=example.com&type=httpupgrade&path=%2Fup&host=cdn.example.com#VUP',
      ),
    );
    expect(vlessLine).toContain('VUP=vless,5.6.7.8,443');
    expect(vlessLine).toContain('ws=true');
    expect(vlessLine).toContain('ws-path=/up');
    expect(vlessLine).toContain('ws-headers="Host:cdn.example.com"');
    expect(vlessLine).toContain('ws-http-upgrade=true');

    const trojanLine = produceSurgeProxy(
      parseUri(
        'trojan://secret@example.com:443?security=tls&sni=example.com&type=httpupgrade&path=%2Fup&host=cdn.example.com#TUP',
      ),
    );
    expect(trojanLine).toContain('TUP=trojan,example.com,443');
    expect(trojanLine).toContain('ws=true');
    expect(trojanLine).toContain('ws-path=/up');
    expect(trojanLine).toContain('ws-headers="Host:cdn.example.com"');
    expect(trojanLine).toContain('ws-http-upgrade=true');

    const vmessLine = produceSurgeProxy({
      name: 'MUP',
      type: 'vmess',
      server: 'vm.example.com',
      port: 443,
      uuid: '11111111-2222-3333-4444-555555555555',
      tls: true,
      network: 'ws',
      'ws-opts': {
        path: '/up',
        headers: { Host: 'cdn.example.com' },
        'v2ray-http-upgrade': true,
      },
    });
    expect(vmessLine).toContain('MUP=vmess,vm.example.com,443');
    expect(vmessLine).toContain('ws=true');
    expect(vmessLine).toContain('ws-path=/up');
    expect(vmessLine).toContain('ws-headers="Host:cdn.example.com"');
    expect(vmessLine).toContain('ws-http-upgrade=true');
  });

  it('emits Surge VLESS XHTTP with encryption', () => {
    const encryption = 'mlkem768x25519plus.native.0rtt.100-111-1111.AAAA';
    const line = produceSurgeProxy({
      name: 'XHTTP',
      type: 'vless',
      server: 'example.com',
      port: 443,
      uuid: '11111111-2222-3333-4444-555555555555',
      tls: true,
      flow: 'xtls-rprx-vision',
      encryption,
      network: 'xhttp',
      'xhttp-opts': {
        path: '/path?a=1,2',
        host: 'cdn.example.com',
        mode: 'stream-one',
        headers: { 'User-Agent': 'UA' },
      },
    });
    expect(line).toContain('xhttp=true');
    expect(line).toContain('xhttp-path="/path?a=1,2"');
    expect(line).toContain('xhttp-host=cdn.example.com');
    expect(line).toContain('xhttp-mode=stream-one');
    expect(line).toContain('xhttp-headers="User-Agent:UA"');
    expect(line).toContain(`encryption=${encryption}`);
    expect(line).toContain('flow=xtls-rprx-vision');
    expect(line).toContain('tls=true');
  });

  it('emits Surge VLESS gRPC mode and authority', () => {
    const line = produceSurgeProxy({
      name: 'GRPC',
      type: 'vless',
      server: '1.2.3.4',
      port: 443,
      uuid: '11111111-2222-3333-4444-555555555555',
      tls: true,
      network: 'grpc',
      'grpc-opts': {
        'grpc-service-name': 'svc',
        'grpc-mode': 'multi',
        'grpc-authority': 'grpc.example.com',
      },
    });
    expect(line).toContain('grpc=true');
    expect(line).toContain('grpc-service-name=svc');
    expect(line).toContain('grpc-mode=multi');
    expect(line).toContain('grpc-authority=grpc.example.com');
  });

  it('rejects invalid Surge VLESS flow combinations', () => {
    const base: ProxyNode = {
      name: 'V',
      type: 'vless',
      server: '1.2.3.4',
      port: 443,
      uuid: '11111111-2222-3333-4444-555555555555',
      flow: 'xtls-rprx-vision',
      tls: true,
    };
    expect(() => produceSurgeProxy({ ...base, network: 'ws' })).toThrow(
      'requires VLESS encryption',
    );
    expect(() => produceSurgeProxy({ ...base, network: 'xhttp' })).toThrow(
      'requires VLESS encryption',
    );
    expect(() =>
      produceSurgeProxy({ ...base, network: 'ws', encryption: 'mlkem768x25519plus.native.0rtt' }),
    ).not.toThrow();
    expect(() =>
      produceSurgeProxy({ ...base, network: 'grpc', 'grpc-opts': { 'grpc-service-name': 'svc' } }),
    ).toThrow('over gRPC');
    expect(() => produceSurgeProxy({ ...base, tls: false })).toThrow('requires TLS');
  });

  it('produces Mihomo YAML', () => {
    const { content, warnings } = produce(parseMihomoYaml(MIHOMO_YAML).nodes, 'mihomo');
    expect(warnings).toEqual([]);
    const yaml = parseYaml(content) as { proxies: Record<string, unknown>[] };
    expect(yaml.proxies).toHaveLength(2);
    expect(yaml.proxies[0]).toMatchObject({
      name: 'HY2',
      type: 'hysteria2',
      server: 'hy.example.com',
      port: 443,
    });
  });

  it('produces sing-box outbounds', () => {
    const { content, warnings } = produce(parseMihomoYaml(MIHOMO_YAML).nodes, 'singbox');
    expect(warnings).toEqual([]);
    const json = JSON.parse(content) as { outbounds: Record<string, unknown>[] };
    expect(json.outbounds.map((item) => item.type)).toEqual(['hysteria2', 'shadowsocks', 'direct']);
  });

  it('produces Egern YAML proxies', () => {
    const { content, warnings } = produce(parseMihomoYaml(MIHOMO_YAML).nodes, 'egern');
    expect(warnings).toEqual([]);
    expect(content).toContain('proxies:');
    expect(content).toContain('hysteria2:');
    expect(content).toContain('shadowsocks:');
  });

  it('reports per-node failures without dropping the output', () => {
    const unsupported: ProxyNode = {
      name: 'WG',
      type: 'wireguard',
      server: 'wg.example.com',
      port: 51820,
      'private-key': 'key',
    };
    const { content, warnings } = produce([unsupported], 'surge');
    expect(content).toBe('');
    expect(warnings[0]).toContain('WG');
  });

  it('round-trips URI output', () => {
    const { content } = produce([parseUri(TROJAN_URI)], 'uri');
    expect(parseUri(content)).toMatchObject({
      type: 'trojan',
      server: 'example.com',
      port: 443,
      password: 'secret',
    });
  });
});

describe('applyProcessors', () => {
  const nodes: ProxyNode[] = [
    {
      name: '香港 01',
      type: 'ss',
      server: 'hk1.example.com',
      port: 8388,
      cipher: 'aes-128-gcm',
      password: 'p',
    },
    {
      name: '香港 02',
      type: 'ss',
      server: 'hk1.example.com',
      port: 8388,
      cipher: 'aes-128-gcm',
      password: 'p',
    },
    { name: '日本 01', type: 'trojan', server: 'jp.example.com', port: 443, password: 'p' },
    { name: '剩余流量：10GB', type: 'ss', server: 'info.example.com', port: 1, password: 'p' },
  ];

  it('filters, renames and sorts', async () => {
    const result = await applyProcessors(
      nodes,
      [
        processor({
          id: '1',
          type: 'useless-filter',
          args: {},
        }),
        processor({
          id: '2',
          type: 'filter',
          args: { field: 'name', pattern: '香港', mode: 'include', flags: 'i' },
        }),
        processor({
          id: '3',
          type: 'rename',
          args: { field: 'name', pattern: '香港', replacement: 'HK', flags: 'g' },
        }),
        processor({
          id: '4',
          type: 'sort',
          args: { by: 'name', order: 'desc' },
        }),
      ],
      'mihomo',
    );
    expect(result.map((node) => node.name)).toEqual(['HK 02', 'HK 01']);
  });

  it('dedupes by server and applies type filters', async () => {
    const deduped = await applyProcessors(
      nodes,
      [
        processor({
          id: '1',
          type: 'useless-filter',
          args: {},
        }),
        processor({
          id: '2',
          type: 'type-filter',
          args: { types: ['ss'], mode: 'include' },
        }),
        processor({
          id: '3',
          type: 'dedupe',
          args: { by: 'server' },
        }),
      ],
      'mihomo',
    );
    expect(deduped).toHaveLength(1);
    expect(deduped[0]?.name).toBe('香港 01');
  });

  it('adds nodes from URI content', async () => {
    const result = await applyProcessors(
      [nodes[2]!],
      [
        processor({
          id: '1',
          type: 'add',
          args: { content: SS_URI, position: 'front' },
        }),
      ],
      'mihomo',
    );
    expect(result.map((node) => node.name)).toEqual(['SS', '日本 01']);
  });

  it('runs inline scripts', async () => {
    const result = await applyProcessors(
      nodes,
      [
        processor({
          id: '1',
          type: 'script',
          args: {
            mode: 'inline',
            content:
              'function operator(proxies) { return proxies.map((p) => ({ ...p, name: "S-" + p.name })) }',
            arguments: {},
          },
        }),
      ],
      'mihomo',
    );
    expect(result[0]?.name).toBe('S-香港 01');
  });

  it('runs inline script filters', async () => {
    const result = await applyProcessors(
      nodes,
      [
        processor({
          id: '1',
          type: 'script-filter',
          args: {
            mode: 'inline',
            content: "function filter(proxies) { return proxies.map((p) => p.type === 'trojan') }",
            arguments: {},
          },
        }),
      ],
      'mihomo',
    );
    expect(result.map((node) => node.name)).toEqual(['日本 01']);
  });
});

describe('applyFlag', () => {
  it('detects region keywords and prefixes flags', () => {
    expect(applyFlag('香港 01', { position: 'prefix', twAsCn: true })).toBe('🇭🇰 香港 01');
    expect(applyFlag('日本 02', { position: 'prefix', twAsCn: true })).toBe('🇯🇵 日本 02');
    expect(applyFlag('US-01', { position: 'prefix', twAsCn: true })).toBe('🇺🇸 US-01');
  });

  it('maps Taiwan to CN', () => {
    expect(applyFlag('台湾 01', { position: 'prefix', twAsCn: true })).toBe('🇨🇳 台湾 01');
    expect(applyFlag('🇹🇼 TW-01', { position: 'replace', twAsCn: true })).toBe('🇨🇳 TW-01');
  });

  it('keeps TW when mapping is disabled', () => {
    expect(applyFlag('🇹🇼 TW-01', { position: 'replace', twAsCn: false })).toBe('🇹🇼 TW-01');
  });

  it('leaves names without a detectable region unchanged', () => {
    expect(applyFlag('Node 01', { position: 'prefix', twAsCn: true })).toBe('Node 01');
  });
});

describe('parseNodes', () => {
  it('parses a Base64 URI list', () => {
    const encoded = Buffer.from(`${SS_URI}\n${TROJAN_URI}`).toString('base64');
    const { nodes, warnings } = parseNodes(encoded);
    expect(nodes.map((node) => node.type)).toEqual(['ss', 'trojan']);
    expect(warnings).toEqual([]);
  });

  it('warns on unknown schemes', () => {
    const { nodes, warnings } = parseNodes('unknown://foo');
    expect(nodes).toHaveLength(0);
    expect(warnings).toHaveLength(1);
  });

  it('parses Surge proxy lines', () => {
    const { nodes, warnings } = parseNodes(
      'HK = ss, 1.2.3.4, 8388, encrypt-method=aes-128-gcm, password="pass", udp-relay=true',
    );
    expect(warnings).toEqual([]);
    expect(nodes[0]).toMatchObject({
      name: 'HK',
      type: 'ss',
      server: '1.2.3.4',
      port: 8388,
      cipher: 'aes-128-gcm',
      password: 'pass',
      udp: true,
    });
  });

  it('parses Loon proxy lines with positional credentials', () => {
    const { nodes, warnings } = parseNodes(
      'HK = Shadowsocks, 1.2.3.4, 8388, aes-128-gcm, "pass", udp=true',
    );
    expect(warnings).toEqual([]);
    expect(nodes[0]).toMatchObject({
      name: 'HK',
      type: 'ss',
      cipher: 'aes-128-gcm',
      password: 'pass',
    });
  });

  it('parses Loon Tailscale nodes', () => {
    const { nodes, warnings } = parseNodes(
      [
        'Tailnet=tailscale',
        'Exit=tailscale,control-url="https://headscale.example.com/?key=a,b",auth-key="test-key=",hostname="loon,device",exit-node=auto,accept-routes=false,accept-dns=true,magic-dns=false,path-mode=derp,mtu=1200,idle-session-timeout=0,udp=false,ip-mode=prefer-v6,block-quic=false',
      ].join('\n'),
    );
    expect(warnings).toEqual([]);
    expect(nodes[0]).toEqual({ name: 'Tailnet', type: 'tailscale', udp: true });
    expect(nodes[1]).toMatchObject({
      name: 'Exit',
      type: 'tailscale',
      'control-url': 'https://headscale.example.com/?key=a,b',
      'auth-key': 'test-key=',
      hostname: 'loon,device',
      'exit-node': 'auto:any',
      'accept-routes': false,
      'accept-dns': true,
      'magic-dns': false,
      'path-mode': 'derp',
      mtu: 1200,
      'idle-session-timeout': 0,
      'ip-version': 'ipv6-prefer',
      'block-quic': 'off',
      udp: false,
    });
  });

  it('parses Quantumult X proxy lines', () => {
    const { nodes, warnings } = parseNodes(
      'vless=5.6.7.8:443, method=none, password=uuid, obfs=wss, obfs-uri=/ws, obfs-host=cdn.example.com, tag=WS',
    );
    expect(warnings).toEqual([]);
    expect(nodes[0]).toMatchObject({
      name: 'WS',
      type: 'vless',
      uuid: 'uuid',
      tls: true,
      network: 'ws',
    });
  });

  it('parses Surge VLESS XHTTP and gRPC parameters', () => {
    const encryption = 'mlkem768x25519plus.native.0rtt.100-111-1111.AAAA';
    const { nodes, warnings } = parseNodes(
      [
        `X = vless, example.com, 443, username=uuid, encryption=${encryption}, flow=xtls-rprx-vision, xhttp=true, xhttp-path="/path?a=1,2", xhttp-host=cdn.example.com, xhttp-mode=stream-one, xhttp-headers="User-Agent:UA", tls=true`,
        'G = vless, 1.2.3.4, 443, username=uuid, grpc=true, grpc-service-name=svc, grpc-mode=multi, grpc-authority=grpc.example.com, tls=true',
      ].join('\n'),
    );
    expect(warnings).toEqual([]);
    expect(nodes[0]).toMatchObject({ type: 'vless', network: 'xhttp', encryption, tls: true });
    expect(nodes[0]?.['xhttp-opts']).toMatchObject({
      path: '/path?a=1,2',
      host: 'cdn.example.com',
      mode: 'stream-one',
      headers: { 'User-Agent': 'UA' },
    });
    expect(nodes[1]?.['grpc-opts']).toMatchObject({
      'grpc-service-name': 'svc',
      'grpc-mode': 'multi',
      'grpc-authority': 'grpc.example.com',
    });
  });

  it('reads proxy sections from client configs', () => {
    const surge = parseNodes(
      '[Proxy]\nHK = ss, 1.2.3.4, 8388, encrypt-method=aes-128-gcm, password=pass\n[Rule]\nFINAL,DIRECT',
    );
    expect(surge.warnings).toEqual([]);
    expect(surge.nodes).toHaveLength(1);

    const qx = parseNodes(
      '[server_local]\nshadowsocks=1.2.3.4:8388, method=aes-128-gcm, password=pass, tag=HK\n[filter_local]\nGEOIP,CN,DIRECT',
    );
    expect(qx.warnings).toEqual([]);
    expect(qx.nodes).toHaveLength(1);
    expect(qx.nodes[0]?.name).toBe('HK');
  });

  it('reports unrecognized content instead of failing silently', () => {
    const { nodes, warnings } = parseNodes('this is not a subscription');
    expect(nodes).toHaveLength(0);
    expect(warnings[0]).toContain('Unrecognized subscription format');
  });

  it('strips wrapping quotes from transport fields', () => {
    const { nodes } = parseNodes(
      'trojan://pass@1.2.3.4:443?security=tls&type=ws&path=%2Fws&host=%22xxx%22&sni=%22xxx%22#T',
    );
    expect(nodes[0]?.['ws-opts']?.headers?.Host).toBe('xxx');
    expect(nodes[0]?.sni).toBe('xxx');
    const { content } = produce(nodes, 'surge');
    expect(content).toContain('ws-headers="Host:xxx"');
    expect(content).not.toContain('\\"');
    expect(content).not.toContain('%22');
  });

  it('round-trips delimiter and quote characters', () => {
    const special: ProxyNode = {
      name: 'T 1',
      type: 'trojan',
      server: '1.2.3.4',
      port: 443,
      password: 'a,"b',
      tls: true,
      sni: 'x',
      network: 'ws',
      'ws-opts': { path: '/a,b c', headers: { Host: 'h"1' } },
    };
    for (const target of ['surge', 'loon', 'qx', 'mihomo', 'uri'] as const) {
      const { content, warnings } = produce([special], target);
      expect(warnings).toEqual([]);
      const back = parseNodes(content).nodes[0];
      expect(back?.password).toBe('a,"b');
      expect(back?.sni).toBe('x');
      expect(back?.['ws-opts']?.path).toBe('/a,b c');
      expect(back?.['ws-opts']?.headers?.Host).toBe('h"1');
    }
  });

  it('emits URI VLESS XHTTP with encryption', () => {
    const encryption = 'mlkem768x25519plus.native.0rtt.100-111-1111.AAAA';
    const { content, warnings } = produce(
      [
        {
          name: 'X',
          type: 'vless',
          server: 'example.com',
          port: 443,
          uuid: '11111111-2222-3333-4444-555555555555',
          tls: true,
          encryption,
          network: 'xhttp',
          'xhttp-opts': { path: '/path?a=1,2', host: 'cdn.example.com', mode: 'stream-one' },
        },
      ],
      'uri',
    );
    expect(warnings).toEqual([]);
    expect(content).toContain('type=xhttp');
    expect(content).toContain('mode=stream-one');
    expect(content).toContain(`encryption=${encryption}`);
    expect(content).not.toContain('encryption=none');
  });

  it('round-trips Surge VLESS XHTTP parameters', () => {
    const encryption = 'mlkem768x25519plus.native.0rtt.100-111-1111.AAAA';
    const { nodes } = parseNodes(
      `X = vless, example.com, 443, username=uuid, encryption=${encryption}, flow=xtls-rprx-vision, xhttp=true, xhttp-path="/path?a=1,2", xhttp-host=cdn.example.com, xhttp-mode=stream-one, tls=true`,
    );
    const { content } = produce(nodes, 'surge');
    const back = parseNodes(content).nodes[0];
    expect(back).toMatchObject({
      type: 'vless',
      network: 'xhttp',
      encryption,
      flow: 'xtls-rprx-vision',
    });
    expect(back?.['xhttp-opts']).toMatchObject({
      path: '/path?a=1,2',
      host: 'cdn.example.com',
      mode: 'stream-one',
    });
  });

  it('round-trips Surge ws-http-upgrade across Surge, URI, Mihomo and sing-box', () => {
    const { nodes, warnings } = parseNodes(
      [
        'V = vless, example.com, 443, username=11111111-2222-3333-4444-555555555555, ws=true, ws-path=/up, ws-headers="Host:cdn.example.com", ws-http-upgrade=true, tls=true',
        'M = vmess, example.com, 443, username=11111111-2222-3333-4444-555555555555, ws=true, ws-path=/up, ws-headers="Host:cdn.example.com", ws-http-upgrade=true, tls=true',
        'T = trojan, example.com, 443, password="secret", ws=true, ws-path=/up, ws-headers="Host:cdn.example.com", ws-http-upgrade=true, tls=true',
      ].join('\n'),
    );
    expect(warnings).toEqual([]);
    for (const node of nodes) {
      expect(node.network).toBe('ws');
      expect(node['ws-opts']).toMatchObject({
        path: '/up',
        headers: { Host: 'cdn.example.com' },
        'v2ray-http-upgrade': true,
      });
    }

    for (const target of ['surge', 'uri', 'mihomo', 'singbox'] as const) {
      const { content, warnings: prodWarnings } = produce(nodes, target);
      expect(prodWarnings).toEqual([]);
      const reparsed = parseNodes(content);
      expect(reparsed.warnings).toEqual([]);
      expect(reparsed.nodes).toHaveLength(3);
      for (const node of reparsed.nodes) {
        expect(node.network).toBe('ws');
        expect(node['ws-opts']?.['v2ray-http-upgrade']).toBe(true);
        expect(node['ws-opts']?.path).toBe('/up');
      }
    }
  });

  it('round-trips the Surge, Loon and QX line formats', () => {
    const source = parseUri(VLESS_WS);
    for (const target of ['surge', 'loon', 'qx'] as const) {
      const { content } = produce([source], target);
      const parsed = parseNodes(content);
      expect(parsed.nodes[0]).toMatchObject({
        type: 'vless',
        server: '5.6.7.8',
        port: 443,
        uuid: '11111111-2222-3333-4444-555555555555',
        tls: true,
      });
    }
  });

  it('emits and round-trips Loon Tailscale nodes', () => {
    const { nodes } = parseNodes(
      'Exit=tailscale,control-url="https://headscale.example.com/?key=a,b",auth-key="test-key=",hostname="loon,device",exit-node=auto,accept-routes=false,accept-dns=true,mtu=1200,ip-mode=prefer-v6,block-quic=false',
    );
    const { content, warnings } = produce(nodes, 'loon');
    expect(warnings).toEqual([]);
    expect(content).toContain('Exit=tailscale');
    expect(content).toContain('control-url="https://headscale.example.com/?key=a,b"');
    expect(content).toContain('hostname="loon,device"');
    expect(content).toContain('exit-node=auto');
    expect(content).toContain('ip-mode=prefer-v6');
    expect(content).toContain('block-quic=false');
    expect(parseNodes(content).nodes).toEqual(nodes);
  });

  it('exports a Mihomo Tailscale node to Loon', () => {
    const { nodes } = parseMihomoYaml(
      'proxies:\n' +
        '  - name: Tailnet\n' +
        '    type: tailscale\n' +
        '    control-url: https://headscale.example.com\n' +
        '    exit-node: auto:any\n' +
        '    accept-routes: false\n' +
        '    udp: false\n' +
        '    ip-version: ipv6-prefer\n',
    );
    expect(nodes[0]?.type).toBe('tailscale');
    expect(nodes[0]?.server).toBeUndefined();
    const { content, warnings } = produce(nodes, 'loon');
    expect(warnings).toEqual([]);
    expect(content).toContain('Tailnet=tailscale');
    expect(content).toContain('control-url="https://headscale.example.com"');
    expect(content).toContain('exit-node=auto');
    expect(content).toContain('ip-mode=prefer-v6');
  });
});
