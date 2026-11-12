import { z } from 'zod';

export const PROXY_TYPES = [
  'ss',
  'vmess',
  'vless',
  'trojan',
  'hysteria2',
  'tuic',
  'anytls',
  'wireguard',
  'snell',
  'http',
  'socks5',
] as const;

export type ProxyType = (typeof PROXY_TYPES)[number];

export const TARGETS = [
  'surge',
  'mihomo',
  'stash',
  'loon',
  'qx',
  'shadowrocket',
  'singbox',
  'uri',
  'json',
] as const;

export type Target = (typeof TARGETS)[number];

export const TARGET_LABELS: Record<Target, string> = {
  surge: 'Surge',
  mihomo: 'Mihomo / Clash.Meta',
  stash: 'Stash',
  loon: 'Loon',
  qx: 'Quantumult X',
  shadowrocket: 'Shadowrocket',
  singbox: 'sing-box',
  uri: 'URI',
  json: 'JSON',
};

export interface TransportOptions {
  path?: string;
  headers?: Record<string, string>;
  host?: string | string[];
  'grpc-service-name'?: string;
  'grpc-mode'?: string;
  'grpc-authority'?: string;
  'v2ray-http-upgrade'?: boolean;
  'max-early-data'?: number;
  'early-data-header-name'?: string;
  [key: string]: unknown;
}

export interface RealityOptions {
  'public-key'?: string;
  'short-id'?: string;
  [key: string]: unknown;
}

export interface PluginOptions {
  mode?: string;
  host?: string;
  path?: string;
  tls?: boolean;
  password?: string;
  version?: number;
  [key: string]: unknown;
}

/**
 * Normalized proxy model. Field names intentionally follow the Clash/Mihomo
 * convention because most producers need to emit those names.
 */
export interface ProxyNode {
  name: string;
  type: ProxyType;
  server: string;
  port: number;
  udp?: boolean;
  tfo?: boolean;
  'ip-version'?: string;
  'skip-cert-verify'?: boolean;

  // credentials
  username?: string;
  password?: string;
  uuid?: string;
  cipher?: string;
  alterId?: number;
  aead?: boolean;
  psk?: string;
  token?: string;
  version?: number;
  'private-key'?: string;
  'public-key'?: string;
  'pre-shared-key'?: string;
  'preshared-key'?: string;

  // tls
  tls?: boolean;
  sni?: string;
  servername?: string;
  alpn?: string[];
  'tls-fingerprint'?: string;
  'client-fingerprint'?: string;
  flow?: string;
  'reality-opts'?: RealityOptions;

  // transport
  network?: string;
  'ws-opts'?: TransportOptions;
  'grpc-opts'?: TransportOptions;
  'h2-opts'?: TransportOptions;
  'http-opts'?: TransportOptions;

  // shadowsocks plugin
  plugin?: string;
  'plugin-opts'?: PluginOptions;

  // hysteria2 / tuic
  obfs?: string;
  'obfs-password'?: string;
  up?: string;
  down?: string;
  ports?: string;
  'congestion-controller'?: string;
  'udp-relay-mode'?: string;
  'reduce-rtt'?: boolean;
  'heartbeat-interval'?: number;
  'disable-sni'?: boolean;

  // wireguard
  ip?: string;
  ipv6?: string;
  mtu?: number;
  reserved?: number[];
  keepalive?: number;
  'persistent-keepalive'?: number;

  // snell
  'obfs-opts'?: PluginOptions;
  reuse?: boolean;

  [key: string]: unknown;
}

export const proxySchema = z
  .object({
    name: z.string().min(1),
    type: z.enum(PROXY_TYPES),
    server: z.string().min(1),
    port: z.number().int().min(1).max(65535),
  })
  .passthrough();

export const sourceKindSchema = z.enum(['remote', 'manual']);
export const targetSchema = z.enum(TARGETS);

const regexFilterSchema = z.object({
  id: z.string(),
  type: z.literal('filter'),
  disabled: z.boolean().optional(),
  args: z.object({
    field: z.enum(['name', 'server']).default('name'),
    pattern: z.string().default(''),
    mode: z.enum(['include', 'exclude']).default('include'),
    flags: z.string().optional(),
  }),
});

const typeFilterSchema = z.object({
  id: z.string(),
  type: z.literal('type-filter'),
  disabled: z.boolean().optional(),
  args: z.object({
    types: z.array(z.enum(PROXY_TYPES)).default([]),
    mode: z.enum(['include', 'exclude']).default('include'),
  }),
});

const uselessFilterSchema = z.object({
  id: z.string(),
  type: z.literal('useless-filter'),
  disabled: z.boolean().optional(),
  args: z.object({}).default({}),
});

const dedupeSchema = z.object({
  id: z.string(),
  type: z.literal('dedupe'),
  disabled: z.boolean().optional(),
  args: z
    .object({
      by: z.enum(['server', 'fingerprint']).default('fingerprint'),
    })
    .default({}),
});

const renameSchema = z.object({
  id: z.string(),
  type: z.literal('rename'),
  disabled: z.boolean().optional(),
  args: z.object({
    field: z.enum(['name', 'server']).default('name'),
    pattern: z.string().default(''),
    replacement: z.string().default(''),
    flags: z.string().optional(),
  }),
});

const prefixSuffixSchema = z.object({
  id: z.string(),
  type: z.literal('prefix-suffix'),
  disabled: z.boolean().optional(),
  args: z.object({
    prefix: z.string().default(''),
    suffix: z.string().default(''),
  }),
});

const sortSchema = z.object({
  id: z.string(),
  type: z.literal('sort'),
  disabled: z.boolean().optional(),
  args: z.object({
    by: z.enum(['name', 'server', 'port', 'type']).default('name'),
    order: z.enum(['asc', 'desc']).default('asc'),
  }),
});

const sortRegexSchema = z.object({
  id: z.string(),
  type: z.literal('sort-regex'),
  disabled: z.boolean().optional(),
  args: z.object({
    patterns: z.array(z.string()).default([]),
  }),
});

const setSchema = z.object({
  id: z.string(),
  type: z.literal('set'),
  disabled: z.boolean().optional(),
  args: z.object({
    fields: z.record(z.unknown()).default({}),
  }),
});

const scriptSchema = z.object({
  id: z.string(),
  type: z.literal('script'),
  disabled: z.boolean().optional(),
  args: z.object({
    mode: z.enum(['inline', 'link']).default('inline'),
    content: z.string().default(''),
    arguments: z.record(z.string()).default({}),
  }),
});

const scriptFilterSchema = z.object({
  id: z.string(),
  type: z.literal('script-filter'),
  disabled: z.boolean().optional(),
  args: z.object({
    mode: z.enum(['inline', 'link']).default('inline'),
    content: z.string().default(''),
    arguments: z.record(z.string()).default({}),
  }),
});

const addSchema = z.object({
  id: z.string(),
  type: z.literal('add'),
  disabled: z.boolean().optional(),
  args: z.object({
    content: z.string().default(''),
    position: z.enum(['front', 'back']).default('back'),
  }),
});

const flagSchema = z.object({
  id: z.string(),
  type: z.literal('flag'),
  disabled: z.boolean().optional(),
  args: z.object({
    position: z.enum(['prefix', 'suffix', 'replace']).default('prefix'),
    twAsCn: z.boolean().default(true),
  }),
});

const dnsServerSchema = z
  .string()
  .trim()
  .min(1)
  .max(500)
  .refine((value) => /^(https:\/\/|tls:\/\/|dot:\/\/)/i.test(value), {
    message: 'DNS server must start with https://, tls:// or dot://',
  });

const dnsSchema = z.object({
  id: z.string(),
  type: z.literal('dns'),
  disabled: z.boolean().optional(),
  args: z.object({
    servers: z.array(dnsServerSchema).max(8).default([]),
    timeoutMs: z.number().int().min(1000).max(30_000).default(5000),
    cacheTtlMinutes: z.number().int().min(0).max(1440).default(30),
  }),
});

export const processorSchema = z.discriminatedUnion('type', [
  regexFilterSchema,
  typeFilterSchema,
  uselessFilterSchema,
  dedupeSchema,
  renameSchema,
  prefixSuffixSchema,
  sortSchema,
  sortRegexSchema,
  setSchema,
  scriptSchema,
  scriptFilterSchema,
  addSchema,
  flagSchema,
  dnsSchema,
]);

export type Processor = z.infer<typeof processorSchema>;

export const sourceCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  kind: sourceKindSchema.default('remote'),
  url: z.string().trim().default(''),
  flowUrl: z.string().trim().default(''),
  content: z.string().default(''),
  userAgent: z.string().trim().default(''),
  headers: z.record(z.string()).default({}),
  proxy: z.string().trim().default(''),
  refreshInterval: z
    .number()
    .int()
    .min(0)
    .max(60 * 24 * 7)
    .default(60),
  noFlow: z.boolean().default(false),
  enabled: z.boolean().default(true),
  processors: z.array(processorSchema).default([]),
});

export const sourceUpdateSchema = sourceCreateSchema.partial();

export const outputCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  target: targetSchema,
  sourceIds: z.array(z.number().int().positive()).default([]),
  processors: z.array(processorSchema).default([]),
  enabled: z.boolean().default(true),
});

export const outputUpdateSchema = outputCreateSchema.partial();

export const shareCreateSchema = z.object({
  note: z.string().trim().max(200).default(''),
  expiresInDays: z.number().int().min(0).max(3650).default(0),
  maxUses: z.number().int().min(0).max(1_000_000).default(0),
});

export const shareUpdateSchema = z.object({
  note: z.string().trim().max(200),
});

export const SUBSCRIPTION_PATH_PATTERN = /^[a-zA-Z0-9_-]+$/;

export const subscriptionPathsSchema = z
  .object({
    privatePath: z
      .string()
      .trim()
      .min(1)
      .max(32)
      .regex(SUBSCRIPTION_PATH_PATTERN, 'Use letters, digits, underscore or hyphen'),
    sharePath: z
      .string()
      .trim()
      .min(1)
      .max(32)
      .regex(SUBSCRIPTION_PATH_PATTERN, 'Use letters, digits, underscore or hyphen'),
  })
  .refine((value) => value.privatePath.toLowerCase() !== value.sharePath.toLowerCase(), {
    message: 'Private and share paths must differ',
    path: ['sharePath'],
  });

export type SubscriptionPaths = z.infer<typeof subscriptionPathsSchema>;

export const loginSchema = z.object({
  password: z.string().min(1),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(200),
});

export interface FlowInfo {
  upload?: number;
  download?: number;
  total?: number;
  expire?: number;
}

export interface SourceDto {
  id: number;
  name: string;
  kind: 'remote' | 'manual';
  url: string;
  flowUrl: string;
  userAgent: string;
  headers: Record<string, string>;
  proxy: string;
  refreshInterval: number;
  noFlow: boolean;
  enabled: boolean;
  processors: Processor[];
  nodeCount: number;
  fetchedAt: string | null;
  lastError: string | null;
  flow: FlowInfo | null;
  content?: string;
  createdAt: string;
  updatedAt: string;
}

export interface OutputDto {
  id: number;
  name: string;
  target: Target;
  url: string;
  sourceIds: number[];
  sources: { id: number; name: string }[];
  processors: Processor[];
  enabled: boolean;
  shareCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ShareDto {
  id: number;
  outputId: number;
  outputName: string;
  token?: string;
  url: string;
  note: string;
  expiresAt: string | null;
  maxUses: number;
  usedCount: number;
  createdAt: string;
}

export interface PreviewNode {
  name: string;
  type: ProxyType;
  server: string;
  port: number;
}

export interface PreviewDto {
  target: Target;
  count: number;
  nodes: PreviewNode[];
  content: string;
  warnings: string[];
}

export interface ApiError {
  code: string;
  message: string;
}

export function isProcessor(value: unknown): value is Processor {
  return processorSchema.safeParse(value).success;
}
