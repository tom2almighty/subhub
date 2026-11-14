import { isIP } from 'node:net';
import tls from 'node:tls';
import type { Processor, ProxyNode } from '@subhub/shared';
import * as dnsPacket from 'dns-packet';

type DnsArgs = Extract<Processor, { type: 'dns' }>['args'];
type DnsServer = { kind: 'doh'; url: string } | { kind: 'dot'; host: string; port: number };

interface CacheEntry {
  address: string;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
const MAX_CONCURRENCY = 6;

function parseDnsServer(value: string): DnsServer {
  const trimmed = value.trim();
  if (/^https:\/\//i.test(trimmed)) {
    new URL(trimmed);
    return { kind: 'doh', url: trimmed };
  }
  if (/^(tls|dot):\/\//i.test(trimmed)) {
    const url = new URL(trimmed.replace(/^dot:\/\//i, 'tls://'));
    if (!url.hostname) throw new Error(`Invalid DoT server: ${trimmed}`);
    const port = url.port ? Number(url.port) : 853;
    if (!Number.isInteger(port) || port <= 0 || port > 65535) {
      throw new Error(`Invalid DoT port: ${trimmed}`);
    }
    return { kind: 'dot', host: url.hostname.replace(/^\[|\]$/g, ''), port };
  }
  throw new Error(`DNS server must be an https:// (DoH) or tls:// (DoT) address: ${trimmed}`);
}

function buildQuery(host: string, type: 'A' | 'AAAA'): Buffer {
  return dnsPacket.encode({
    type: 'query',
    id: Math.floor(Math.random() * 65_535) + 1,
    flags: dnsPacket.RECURSION_DESIRED,
    questions: [{ name: host, type, class: 'IN' }],
  });
}

function pickAnswer(packet: dnsPacket.Packet, type: 'A' | 'AAAA'): string | undefined {
  for (const answer of packet.answers ?? []) {
    if (answer.type === type && typeof answer.data === 'string') return answer.data;
  }
  return undefined;
}

async function queryDoh(server: DnsServer, host: string, type: 'A' | 'AAAA', timeout: number) {
  if (server.kind !== 'doh') throw new Error('Not a DoH server');
  const response = await fetch(server.url, {
    method: 'POST',
    headers: {
      accept: 'application/dns-message',
      'content-type': 'application/dns-message',
    },
    body: new Uint8Array(buildQuery(host, type)),
    signal: AbortSignal.timeout(timeout),
  });
  if (!response.ok) throw new Error(`DoH returned HTTP ${response.status}`);
  const packet = dnsPacket.decode(Buffer.from(await response.arrayBuffer()));
  return pickAnswer(packet, type);
}

function queryDot(
  server: DnsServer,
  host: string,
  type: 'A' | 'AAAA',
  timeout: number,
): Promise<string | undefined> {
  if (server.kind !== 'dot') return Promise.reject(new Error('Not a DoT server'));
  const payload = buildQuery(host, type);
  return new Promise((resolve, reject) => {
    const socket = tls.connect({
      host: server.host,
      port: server.port,
      servername: isIP(server.host) ? undefined : server.host,
      timeout,
      rejectUnauthorized: true,
    });
    let buffer = Buffer.alloc(0);
    let settled = false;

    function finish(error?: Error, body?: Buffer) {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (error) {
        reject(error);
        return;
      }
      try {
        resolve(body ? pickAnswer(dnsPacket.decode(body), type) : undefined);
      } catch (decodeError) {
        reject(decodeError);
      }
    }

    socket.once('secureConnect', () => {
      const length = Buffer.alloc(2);
      length.writeUInt16BE(payload.length, 0);
      socket.write(Buffer.concat([length, payload]));
    });
    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, typeof chunk === 'string' ? Buffer.from(chunk) : chunk]);
      if (buffer.length < 2) return;
      const length = buffer.readUInt16BE(0);
      if (buffer.length >= length + 2) finish(undefined, buffer.subarray(2, 2 + length));
    });
    socket.once('timeout', () => finish(new Error('DNS query timed out')));
    socket.once('error', (error) => finish(error));
  });
}

function queryServer(
  server: DnsServer,
  host: string,
  timeout: number,
): Promise<string | undefined> {
  const query = server.kind === 'doh' ? queryDoh : queryDot;
  return query(server, host, 'A', timeout).then(
    (address) => address ?? query(server, host, 'AAAA', timeout),
  );
}

async function resolveHost(
  host: string,
  servers: DnsServer[],
  options: { timeout: number; cacheTtlMinutes: number },
): Promise<string> {
  if (isIP(host)) return host;
  if (servers.length === 0) throw new Error('No DNS servers configured');

  const serverKey = servers
    .map((server) => (server.kind === 'doh' ? server.url : `${server.host}:${server.port}`))
    .join(',');
  const cacheKey = `${options.cacheTtlMinutes}|${serverKey}|${host}`;
  const ttlMs = options.cacheTtlMinutes * 60_000;
  if (ttlMs > 0) {
    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.address;
  }

  const errors: string[] = [];
  for (const server of servers) {
    try {
      const address = await queryServer(server, host, options.timeout);
      if (address) {
        if (ttlMs > 0) cache.set(cacheKey, { address, expiresAt: Date.now() + ttlMs });
        return address;
      }
      errors.push(`${server.kind} returned no answer`);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : `${error}`);
    }
  }
  throw new Error(errors.join('; '));
}

export async function resolveNodeServers(
  nodes: ProxyNode[],
  args: DnsArgs,
  onWarning?: (message: string) => void,
): Promise<ProxyNode[]> {
  const servers: DnsServer[] = [];
  for (const value of args.servers) {
    try {
      servers.push(parseDnsServer(value));
    } catch (error) {
      onWarning?.(error instanceof Error ? error.message : `${error}`);
    }
  }
  if (servers.length === 0) {
    onWarning?.('No valid DoH or DoT server is configured');
    return nodes;
  }

  const result = [...nodes];
  for (let start = 0; start < result.length; start += MAX_CONCURRENCY) {
    const chunk = result.slice(start, start + MAX_CONCURRENCY);
    await Promise.all(
      chunk.map(async (node, offset) => {
        const host = node.server;
        if (!host || isIP(host)) return;
        try {
          const address = await resolveHost(host, servers, {
            timeout: args.timeoutMs,
            cacheTtlMinutes: args.cacheTtlMinutes,
          });
          result[start + offset] = { ...node, server: address };
        } catch (error) {
          onWarning?.(`${node.name}: ${error instanceof Error ? error.message : error}`);
        }
      }),
    );
  }
  return result;
}
