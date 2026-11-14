import { createRequire } from 'node:module';
import vm from 'node:vm';
import type { Processor, ProxyNode, Target } from '@subhub/shared';
import _ from 'lodash';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { resolveNodeServers } from './dns.js';
import { applyFlag } from './flags.js';
import { parseNodes } from './parse/index.js';

const nodeRequire = createRequire(import.meta.url);
const allowedModules = new Set([
  'crypto',
  'buffer',
  'url',
  'util',
  'zlib',
  'stream',
  'querystring',
  'string_decoder',
]);

const scriptCache = new Map<string, { content: string; fetchedAt: number }>();
const SCRIPT_CACHE_TTL = 60 * 60 * 1000;
const SCRIPT_TIMEOUT = 10_000;

function b64d(value: string): string {
  return Buffer.from(value, 'base64').toString('utf8');
}

function b64e(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64');
}

function limitedRequire(id: string): unknown {
  const name = id.replace(/^node:/, '');
  if (!allowedModules.has(name)) {
    throw new Error(`require('${id}') is not allowed in scripts`);
  }
  return nodeRequire(`node:${name}`);
}

async function loadScript(mode: 'inline' | 'link', content: string): Promise<string> {
  if (mode === 'inline') return content;
  const cached = scriptCache.get(content);
  if (cached && Date.now() - cached.fetchedAt < SCRIPT_CACHE_TTL) return cached.content;
  const response = await fetch(content, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`Failed to load script: HTTP ${response.status}`);
  const text = await response.text();
  scriptCache.set(content, { content: text, fetchedAt: Date.now() });
  return text;
}

function createFunction(
  script: string,
  name: 'operator' | 'filter',
  args: Record<string, string>,
  target: Target,
): (...callArgs: unknown[]) => unknown {
  const options = { target, platform: target };
  const ProxyUtils = {
    yaml: {
      parse: parseYaml,
      stringify: stringifyYaml,
      safeLoad: parseYaml,
      safeDump: stringifyYaml,
    },
    Base64: { decode: b64d, encode: b64e },
    Buffer,
  };
  const sandbox = {
    console,
    Buffer,
    URL,
    URLSearchParams,
    setTimeout,
    clearTimeout,
    $arguments: args,
    $options: options,
    $substore: {
      log: (...values: unknown[]) => console.log(...values),
      info: (...values: unknown[]) => console.info(...values),
      warn: (...values: unknown[]) => console.warn(...values),
      error: (...values: unknown[]) => console.error(...values),
    },
    lodash: _,
    yaml: ProxyUtils.yaml,
    ProxyUtils,
    b64d,
    b64e,
    require: limitedRequire,
  };
  vm.createContext(sandbox);
  const wrapper = `(function () {\n${script}\n; return typeof ${name} === 'function' ? ${name} : undefined;\n})()`;
  const fn = vm.runInContext(wrapper, sandbox, { timeout: 5000 });
  if (typeof fn !== 'function') {
    throw new Error(`Script must define a function named ${name}`);
  }
  return fn as (...callArgs: unknown[]) => unknown;
}

async function withTimeout<T>(promise: Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('Script execution timed out')), SCRIPT_TIMEOUT);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function compileRegex(pattern: string, flags?: string): RegExp {
  return new RegExp(pattern, flags ?? 'i');
}

function fingerprint(node: ProxyNode): string {
  return JSON.stringify([
    node.type,
    node.server,
    node.port,
    node.uuid,
    node.password,
    node.cipher,
    node.network,
    node['ws-opts']?.path,
  ]);
}

const USELESS_PATTERNS = [
  /剩余流量/i,
  /过期时间/i,
  /套餐/i,
  /官网/i,
  /订阅/i,
  /到期/i,
  /重置/i,
  /距离下次/i,
  /流量重置/i,
  /expire/i,
  /traffic/i,
  /website/i,
  /renew/i,
];

export interface ProcessorOptions {
  onWarning?: (message: string) => void;
}

export async function applyProcessors(
  input: ProxyNode[],
  processors: Processor[],
  target: Target,
  options: ProcessorOptions = {},
): Promise<ProxyNode[]> {
  let nodes = structuredClone(input);
  for (const processor of processors) {
    if (processor.disabled) continue;
    switch (processor.type) {
      case 'filter': {
        const regex = compileRegex(processor.args.pattern, processor.args.flags);
        const keep = processor.args.mode === 'include';
        nodes = nodes.filter((node) => {
          const value = processor.args.field === 'server' ? (node.server ?? '') : node.name;
          return regex.test(value) === keep;
        });
        break;
      }
      case 'type-filter': {
        const keep = processor.args.mode === 'include';
        const types = new Set(processor.args.types);
        nodes = nodes.filter((node) => types.has(node.type) === keep);
        break;
      }
      case 'useless-filter': {
        nodes = nodes.filter(
          (node) => !USELESS_PATTERNS.some((pattern) => pattern.test(node.name)),
        );
        break;
      }
      case 'dedupe': {
        const seen = new Set<string>();
        nodes = nodes.filter((node) => {
          const endpoint = node.server ?? node.hostname ?? node['control-url'] ?? '';
          const key =
            processor.args.by === 'server' ? `${endpoint}:${node.port ?? ''}` : fingerprint(node);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        break;
      }
      case 'rename': {
        const regex = compileRegex(processor.args.pattern, processor.args.flags);
        nodes = nodes.map((node) => {
          if (processor.args.field === 'server') {
            if (!node.server) return node;
            return { ...node, server: node.server.replace(regex, processor.args.replacement) };
          }
          return { ...node, name: node.name.replace(regex, processor.args.replacement) };
        });
        break;
      }
      case 'prefix-suffix': {
        nodes = nodes.map((node) => ({
          ...node,
          name: `${processor.args.prefix}${node.name}${processor.args.suffix}`,
        }));
        break;
      }
      case 'sort': {
        const { by, order } = processor.args;
        const direction = order === 'desc' ? -1 : 1;
        nodes = [...nodes].sort((left, right) => {
          const a = left[by];
          const b = right[by];
          if (typeof a === 'number' && typeof b === 'number') return (a - b) * direction;
          return `${a ?? ''}`.localeCompare(`${b ?? ''}`) * direction;
        });
        break;
      }
      case 'sort-regex': {
        const patterns = processor.args.patterns.map((pattern) => compileRegex(pattern));
        const rank = (node: ProxyNode) => {
          const index = patterns.findIndex((pattern) => pattern.test(node.name));
          return index < 0 ? Number.MAX_SAFE_INTEGER : index;
        };
        nodes = [...nodes].sort((left, right) => rank(left) - rank(right));
        break;
      }
      case 'set': {
        nodes = nodes.map((node) => ({ ...node, ...processor.args.fields }));
        break;
      }
      case 'flag': {
        nodes = nodes.map((node) => ({
          ...node,
          name: applyFlag(node.name, processor.args),
        }));
        break;
      }
      case 'dns': {
        nodes = await resolveNodeServers(nodes, processor.args, options.onWarning);
        break;
      }
      case 'add': {
        const result = parseNodes(processor.args.content);
        nodes =
          processor.args.position === 'front'
            ? [...result.nodes, ...nodes]
            : [...nodes, ...result.nodes];
        break;
      }
      case 'script': {
        const script = await loadScript(processor.args.mode, processor.args.content);
        const operator = createFunction(script, 'operator', processor.args.arguments, target);
        const result = await withTimeout(
          Promise.resolve(operator(nodes, target, { target })) as Promise<unknown>,
        );
        if (Array.isArray(result)) nodes = result as ProxyNode[];
        else if (result != null) throw new Error('Script operator must return an array');
        break;
      }
      case 'script-filter': {
        const script = await loadScript(processor.args.mode, processor.args.content);
        const filter = createFunction(script, 'filter', processor.args.arguments, target);
        const result = await withTimeout(
          Promise.resolve(filter(nodes, target, { target })) as Promise<unknown>,
        );
        if (Array.isArray(result)) {
          if (result.every((item) => typeof item === 'boolean')) {
            nodes = nodes.filter((_, index) => result[index] === true);
          } else {
            nodes = result as ProxyNode[];
          }
        } else if (typeof result === 'boolean') {
          if (!result) nodes = [];
        } else {
          throw new Error('Script filter must return an array or boolean');
        }
        break;
      }
      default:
        break;
    }
  }
  return nodes;
}
