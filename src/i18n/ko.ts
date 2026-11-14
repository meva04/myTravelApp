export const ko = {
  'common.ok': '확인',
  'common.cancel': '취소',
  'common.save': '저장',
  'common.delete': '삭제',
  'common.add': '추가',
  'common.retryWhenOnline': '연결되면 다시 시도',
  'common.retry': '다시 시도',
} as const;

export type StringKey = keyof typeof ko;

export function t(key: StringKey, vars?: Record<string, string | number>): string {
  let s: string = ko[key];
  if (vars) for (const k of Object.keys(vars)) s = s.replace(`{${k}}`, String(vars[k]));
  return s;
}
