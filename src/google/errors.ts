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
export async function callJson<T>(fetchFn: typeof fetch, url: string, init: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetchFn(url, init);
  } catch {
    throw new OfflineError();
  }
  if (!res.ok) throw new GoogleApiError(res.status);
  return (await res.json()) as T;
}
