import { photoBlocks } from './DiaryDay';

const shape = (n: number) => photoBlocks(n).map((b) => `${b.kind}:${b.tiles.map((t) => (t.more ? `+${t.more}` : t.index)).join(',')}`);

test('the cover photo is always alone on top; the rest fill blocks of up to five, shaped by how many there are', () => {
  expect(shape(0)).toEqual([]);
  expect(shape(1)).toEqual(['cover:0']);
  expect(shape(2)).toEqual(['cover:0', 'one:1']); // 위아래 한 칼럼
  expect(shape(3)).toEqual(['cover:0', 'two:1,2']); // 대표 아래 좌우
  expect(shape(5)).toEqual(['cover:0', 'four:1,2,3,4']);
  expect(shape(6)).toEqual(['cover:0', 'five:1,2,3,4,5']);
  expect(shape(7)).toEqual(['cover:0', 'five:1,2,3,4,5', 'one:6']);
  expect(shape(10)).toEqual(['cover:0', 'five:1,2,3,4,5', 'four:6,7,8,9']);
});

test('at most ten photos are shown; the eleventh place is a + tile for the rest', () => {
  expect(shape(11)).toEqual(['cover:0', 'five:1,2,3,4,5', 'five:6,7,8,9,+1']);
  expect(shape(15)).toEqual(['cover:0', 'five:1,2,3,4,5', 'five:6,7,8,9,+5']);
  // + 칸을 누르면 11번째 사진(인덱스 10)부터 크게 본다
  expect(photoBlocks(15)[2].tiles[4]).toEqual({ index: 10, more: 5 });
});
