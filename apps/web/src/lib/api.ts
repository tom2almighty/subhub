import type { OutputDto, PreviewDto, ShareDto, SourceDto, SubscriptionPaths } from '@subhub/shared';

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = init.method ?? 'GET';
  const headers = new Headers(init.headers);
  if (!['GET', 'HEAD'].includes(method.toUpperCase())) {
    headers.set('x-subhub-request', '1');
  }
  if (init.body && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }
  const response = await fetch(path, {
    ...init,
    method,
    headers,
    credentials: 'include',
  });
  if (!response.ok) {
    let code = `HTTP_${response.status}`;
    let message = response.statusText || 'Request failed';
    try {
      const body = (await response.json()) as { code?: string; message?: string };
      if (body.code) code = body.code;
      if (body.message) message = body.message;
    } catch {
      // keep defaults
    }
    throw new ApiError(response.status, code, message);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

function json(body: unknown): string {
  return JSON.stringify(body);
}

export const api = {
  login: (password: string) =>
    request<{ authenticated: true }>('/api/auth/login', {
      method: 'POST',
      body: json({ password }),
    }),
  logout: () => request<{ ok: true }>('/api/auth/logout', { method: 'POST' }),
  me: () => request<{ authenticated: true }>('/api/auth/me'),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ ok: true }>('/api/auth/password', {
      method: 'POST',
      body: json({ currentPassword, newPassword }),
    }),

  listSources: () => request<SourceDto[]>('/api/sources'),
  getSource: (id: number) => request<SourceDto>(`/api/sources/${id}`),
  createSource: (body: unknown) =>
    request<SourceDto>('/api/sources', { method: 'POST', body: json(body) }),
  updateSource: (id: number, body: unknown) =>
    request<SourceDto>(`/api/sources/${id}`, { method: 'PATCH', body: json(body) }),
  deleteSource: (id: number) => request<{ ok: true }>(`/api/sources/${id}`, { method: 'DELETE' }),
  refreshSource: (id: number) =>
    request<SourceDto>(`/api/sources/${id}/refresh`, { method: 'POST' }),
  getSourceNodes: (id: number) =>
    request<{ nodes: import('@subhub/shared').ProxyNode[]; warnings: string[] }>(
      `/api/sources/${id}/nodes`,
    ),

  listOutputs: () => request<OutputDto[]>('/api/outputs'),
  getOutput: (id: number) => request<OutputDto>(`/api/outputs/${id}`),
  createOutput: (body: unknown) =>
    request<OutputDto>('/api/outputs', { method: 'POST', body: json(body) }),
  updateOutput: (id: number, body: unknown) =>
    request<OutputDto>(`/api/outputs/${id}`, { method: 'PATCH', body: json(body) }),
  deleteOutput: (id: number) => request<{ ok: true }>(`/api/outputs/${id}`, { method: 'DELETE' }),
  previewOutput: (id: number, target?: string) =>
    request<PreviewDto>(
      `/api/outputs/${id}/preview${target ? `?target=${encodeURIComponent(target)}` : ''}`,
    ),

  listShares: () => request<ShareDto[]>('/api/shares'),
  createShare: (body: unknown) =>
    request<ShareDto>('/api/shares', {
      method: 'POST',
      body: json(body),
    }),
  updateShare: (id: number, note: string) =>
    request<ShareDto>(`/api/shares/${id}`, { method: 'PATCH', body: json({ note }) }),
  deleteShare: (id: number) => request<{ ok: true }>(`/api/shares/${id}`, { method: 'DELETE' }),

  getSettings: () => request<SubscriptionPaths>('/api/settings'),
  updateSettings: (body: SubscriptionPaths) =>
    request<SubscriptionPaths>('/api/settings', { method: 'PATCH', body: json(body) }),
};
