// 계획 메모·이동 메모를 체크리스트로 다룬다. 저장은 기존 메모 칸에 한 줄에 한 항목씩
// "[ ] 할 일" / "[x] 한 일" 로 한다. 표시가 없는 예전 메모 줄은 아직 안 한 항목으로 읽는다.

export type CheckItem = { id: string; text: string; done: boolean };

const LINE = /^\[( |x|X)\]\s?(.*)$/;

export function parseChecklist(text: string): CheckItem[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '')
    .map((l, i) => {
      const m = LINE.exec(l);
      return m ? { id: `c${i}`, text: m[2].trim(), done: m[1] !== ' ' } : { id: `c${i}`, text: l, done: false };
    })
    .filter((it) => it.text !== '');
}

/** 빈 항목은 버리고 저장할 글로 바꾼다. */
export function serializeChecklist(items: CheckItem[]): string {
  return items
    .filter((it) => it.text.trim() !== '')
    .map((it) => `[${it.done ? 'x' : ' '}] ${it.text.trim().replace(/\n/g, ' ')}`)
    .join('\n');
}

export function toggleItem(items: CheckItem[], id: string): CheckItem[] {
  return items.map((it) => (it.id === id ? { ...it, done: !it.done } : it));
}
