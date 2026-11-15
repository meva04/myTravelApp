import { parseChecklist, serializeChecklist, toggleItem } from './checklist';

test('a checklist round-trips through text, keeping what is done', () => {
  const items = parseChecklist('[ ] 초밥 예약 확인\n[x] 교통카드 충전\n');
  expect(items.map((i) => [i.text, i.done])).toEqual([['초밥 예약 확인', false], ['교통카드 충전', true]]);
  expect(serializeChecklist(items)).toBe('[ ] 초밥 예약 확인\n[x] 교통카드 충전');
});

test('an older plain memo becomes unchecked items, one per line', () => {
  expect(parseChecklist('초밥 / 예약완료\n\n  우산 ').map((i) => [i.text, i.done])).toEqual([['초밥 / 예약완료', false], ['우산', false]]);
});

test('empty items are dropped when saving, and toggling flips one item', () => {
  const items = toggleItem(parseChecklist('[ ] a\n[ ] b'), 'c1');
  expect(serializeChecklist([...items, { id: 'n', text: '  ', done: false }])).toBe('[ ] a\n[x] b');
  expect(parseChecklist('')).toEqual([]);
});
