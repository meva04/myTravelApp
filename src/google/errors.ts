export class OfflineError extends Error {
  constructor() {
    super('offline');
    this.name = 'OfflineError';
  }
}

export class GoogleApiError extends Error {
  constructor(public status: number, message = `google api error ${status}`) {
    super(message);
    this.name = 'GoogleApiError';
  }
}

/** fetch 를 감싸 네트워크 실패는 OfflineError, 200 이 아니면 GoogleApiError 로 바꾼다. */
export async function callJson<T>(fetchFn: typeof fetch, url: string, init: RequestInit, timeoutMs = 10000): Promise<T> {
  // 신호가 약한 곳에서 한없이 기다리지 않도록 10초가 지나면 오프라인으로 본다.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetchFn(url, { ...init, signal: controller.signal });
  } catch {
    throw new OfflineError();
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) throw new GoogleApiError(res.status);
  try {
    return (await res.json()) as T;
  } catch {
    throw new GoogleApiError(res.status, 'invalid response');
  }
}
