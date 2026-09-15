import { sampleRequest } from '../../../examples/sample-data';
export interface BackendRequest { url: string; method?: string; params?: Record<string, unknown>; data?: unknown; responseType?: string; }
export async function axiosForBackend(options: BackendRequest): Promise<{ data: any }> {
  if (import.meta.env.MODE === 'demo') return { data: await sampleRequest(options) };
  // Implement the same-origin authenticated routes documented in docs/ADAPTER.md.
  // Never put gateway/API keys in VITE_* variables or browser storage.
  const url = new URL(options.url, location.origin);
  for (const [key, value] of Object.entries(options.params || {})) if (value != null) url.searchParams.set(key, String(value));
  const response = await fetch(url, { method: options.method || 'GET', credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' }, body: options.data === undefined ? undefined : JSON.stringify(options.data), cache: 'no-store' });
  if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? '没有访问权限，请核对本人账号和工作空间。' : '工作空间暂不可用，请检查连接后重试。');
  if (options.responseType === 'blob') return { data: await response.blob() };
  if (!(response.headers.get('content-type') || '').includes('application/json')) throw new Error('尚未连接工作空间，请让你的 Agent 按接手说明配置。');
  return { data: await response.json() };
}
