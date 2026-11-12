import type { FlowInfo } from '@subhub/shared';

export function formatBytes(value: number | undefined): string {
  if (value == null || !Number.isFinite(value)) return '-';
  if (value <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  const size = value / 1024 ** index;
  return `${size.toFixed(size >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString();
}

export function formatFlow(flow: FlowInfo | null): string {
  if (!flow) return '-';
  const used = (flow.upload ?? 0) + (flow.download ?? 0);
  return `${formatBytes(used)} / ${formatBytes(flow.total)}`;
}

export function formatExpire(value: number | undefined): string {
  if (!value) return '-';
  const date = new Date(value * 1000);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString();
}
