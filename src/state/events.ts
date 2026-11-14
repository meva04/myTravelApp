// 화면 밖(백그라운드 도착 감지 등)에서 데이터가 바뀌었음을 열려 있는 화면에 알린다.
type Listener = () => void;
const listeners = new Set<Listener>();

export function onDataChanged(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function emitDataChanged(): void {
  for (const fn of listeners) fn();
}
