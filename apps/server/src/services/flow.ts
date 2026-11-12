import type { FlowInfo } from '@subhub/shared';

export function parseFlowHeader(value: string | undefined): FlowInfo | null {
  if (!value) return null;
  const result: FlowInfo = {};
  for (const part of value.split(';')) {
    const [rawKey, rawValue] = part.split('=');
    if (!rawKey || rawValue == null) continue;
    const key = rawKey.trim().toLowerCase();
    const number = Number.parseInt(rawValue.trim(), 10);
    if (!Number.isFinite(number)) continue;
    if (key === 'upload') result.upload = number;
    else if (key === 'download') result.download = number;
    else if (key === 'total') result.total = number;
    else if (key === 'expire') result.expire = number;
  }
  return Object.keys(result).length > 0 ? result : null;
}

export function mergeFlows(flows: (FlowInfo | null | undefined)[]): FlowInfo | null {
  const present = flows.filter((flow): flow is FlowInfo => !!flow);
  if (present.length === 0) return null;
  const result: FlowInfo = {};
  for (const flow of present) {
    if (flow.upload != null) result.upload = (result.upload ?? 0) + flow.upload;
    if (flow.download != null) result.download = (result.download ?? 0) + flow.download;
    if (flow.total != null) result.total = (result.total ?? 0) + flow.total;
    if (flow.expire != null) {
      result.expire = result.expire == null ? flow.expire : Math.min(result.expire, flow.expire);
    }
  }
  return result;
}

export function toFlowHeader(flow: FlowInfo | null): string | undefined {
  if (!flow) return undefined;
  const parts: string[] = [];
  if (flow.upload != null) parts.push(`upload=${flow.upload}`);
  if (flow.download != null) parts.push(`download=${flow.download}`);
  if (flow.total != null) parts.push(`total=${flow.total}`);
  if (flow.expire != null) parts.push(`expire=${flow.expire}`);
  return parts.length > 0 ? parts.join('; ') : undefined;
}
