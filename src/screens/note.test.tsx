import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import { makeTestServices, withServices } from '@/testing/services';

import { appendStop } from './AddStopScreen';
import { NoteScreen } from './NoteScreen';

async function setup() {
  const sv = await makeTestServices();
  const trip = await sv.repo.createTrip({ name: 't', city: 'c', startDate: '2027-03-01', endDate: '2027-03-01', baseCurrency: 'KRW' });
  const [day] = await sv.repo.listDays(trip.id);
  const a = await appendStop(sv, day.id, { placeId: null, name: '교토역', lat: 1, lng: 1 });
  await appendStop(sv, day.id, { placeId: null, name: '도미센', lat: 1, lng: 1 });
  const note = await sv.repo.addNote(day.id, a.id, '이코카 구입');
  return { sv, trip, day, a, note };
}

test('a travel note has its own record, photos and expenses like a place', async () => {
  const { sv, trip, note } = await setup();
  const picked = { uri: 'n.jpg', takenAt: '2027-03-01T00:00:00.000Z', lat: null, lng: null };
  await render(withServices(sv, <NoteScreen noteId={note.id} pickPhoto={async () => [picked]} resolvePhoto={(u) => u} />));
  expect(await screen.findByText('이동 메모 · 교토역 → 도미센')).toBeTruthy();
  expect(screen.getByDisplayValue('이코카 구입')).toBeTruthy();

  await fireEvent.press(screen.getByRole('checkbox', { name: '이코카 구입' }));
  await waitFor(async () => expect((await sv.repo.getNote(note.id))?.done).toBe(true));

  const memo = screen.getByPlaceholderText('가는 길에 있었던 일을 적어보세요');
  await fireEvent.changeText(memo, '현금만 받았다');
  await fireEvent(memo, 'blur');
  await waitFor(async () => expect((await sv.repo.getNote(note.id))?.memo).toBe('현금만 받았다'));

  await fireEvent.press(screen.getByText('사진첩에서'));
  await waitFor(async () => expect((await sv.repo.listNotePhotos(note.id)).map((p) => p.uri)).toEqual(['n.jpg']));

  await fireEvent.changeText(screen.getByPlaceholderText('금액'), '2000');
  await fireEvent.press(screen.getByText('비용 추가'));
  await waitFor(async () => expect((await sv.repo.listExpenses(trip.id)).map((e) => [e.amount, e.noteId, e.stopId])).toEqual([[2000, note.id, null]]));
  expect(await screen.findByText('소계 2,000 KRW')).toBeTruthy();
});

test('a travel note can be deleted together with its photos', async () => {
  const { sv, a, note } = await setup();
  await sv.repo.addPhoto({ stopId: a.id, noteId: note.id, uri: 'n.jpg', takenAt: '2027-03-01T00:00:00.000Z', lat: null, lng: null });
  const removedFiles: string[] = [];
  const done = jest.fn();
  jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => buttons?.find((b) => b.style === 'destructive')?.onPress?.());
  await render(withServices(sv, <NoteScreen noteId={note.id} pickPhoto={async () => []} resolvePhoto={(u) => u} onPhotoRemoved={(u) => void removedFiles.push(u)} onRemoved={done} />));
  await fireEvent.press(await screen.findByText('이 이동 메모 삭제'));
  await waitFor(() => expect(done).toHaveBeenCalled());
  expect(await sv.repo.getNote(note.id)).toBeNull();
  expect(removedFiles).toEqual(['n.jpg']);
});
