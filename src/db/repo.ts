import { parseChecklist } from '@/domain/checklist';
import type { Day, Expense, Id, Leg, Note, Photo, Stop, Trip } from '@/domain/types';

import type { Db } from './Db';
import { ADDED_COLUMNS, SCHEMA } from './schema';

type TripRow = Omit<Trip, 'rates'> & { rates: string };
type LegRow = Omit<Leg, 'options'> & { options: string };

type StopRow = Omit<Stop, 'skipped'> & { skipped: number };
type NoteRow = Omit<Note, 'done'> & { done: number };
const toNote = (r: NoteRow): Note => ({ ...r, done: r.done === 1 });
const noteCols = 'id, stopId, "order", text, done, memo';

const toTrip = (r: TripRow): Trip => ({ ...r, rates: JSON.parse(r.rates) });
const toStop = (r: StopRow): Stop => ({ ...r, skipped: r.skipped === 1 });

/** 'YYYY-MM-DD' 두 날짜 사이의 모든 날짜 (양끝 포함). */
export function datesBetween(start: string, end: string): string[] {
  const out: string[] = [];
  const d = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  while (d <= last) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

export function makeRepo(db: Db, newId: () => Id) {
  const stopCols = 'id, dayId, "order", placeId, name, lat, lng, plannedTime, arrivedAt, arrivalMethod, memo, planNote, skipped, legNote';
  const stopParams = (s: Stop) => [
    s.id, s.dayId, s.order, s.placeId, s.name, s.lat, s.lng, s.plannedTime, s.arrivedAt, s.arrivalMethod, s.memo, s.planNote, s.skipped ? 1 : 0, s.legNote,
  ];

  // 쓰기 작업을 한 번에 하나씩, 트랜잭션으로 실행한다 (동시에 저장해도 섞이지 않게).
  let queue: Promise<unknown> = Promise.resolve();
  function write<T>(fn: () => Promise<T>): Promise<T> {
    const run = queue.then(async () => {
      await db.run('BEGIN');
      try {
        const result = await fn();
        await db.run('COMMIT');
        return result;
      } catch (e) {
        await db.run('ROLLBACK');
        throw e;
      }
    });
    queue = run.catch(() => {});
    return run;
  }

  return {
    async migrate(): Promise<void> {
      await db.run('PRAGMA foreign_keys = ON');
      for (const sql of SCHEMA) await db.run(sql);
      for (const [table, column, def] of ADDED_COLUMNS) {
        const cols = await db.all<{ name: string }>(`PRAGMA table_info(${table})`);
        if (!cols.some((c) => c.name === column)) await db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${def}`);
      }
      // 예전에는 이동 메모를 장소의 legNote 칸에 체크리스트 글로 두었다. 항목마다 이동 메모로 옮긴다.
      for (const old of await db.all<{ id: Id; legNote: string }>("SELECT id, legNote FROM stop WHERE legNote != ''")) {
        let order = 0;
        for (const item of parseChecklist(old.legNote)) {
          await db.run('INSERT INTO note (id, stopId, "order", text, done, memo) VALUES (?,?,?,?,?,?)', [newId(), old.id, order++, item.text, item.done ? 1 : 0, '']);
        }
        await db.run("UPDATE stop SET legNote='' WHERE id=?", [old.id]);
      }
    },

    async createTrip(input: Omit<Trip, 'id' | 'rates'>): Promise<Trip> {
      const trip: Trip = { ...input, id: newId(), rates: {} };
      await db.run(
        'INSERT INTO trip (id, name, city, startDate, endDate, baseCurrency, rates) VALUES (?,?,?,?,?,?,?)',
        [trip.id, trip.name, trip.city, trip.startDate, trip.endDate, trip.baseCurrency, '{}'],
      );
      for (const date of datesBetween(trip.startDate, trip.endDate)) {
        await db.run('INSERT INTO day (id, tripId, date) VALUES (?,?,?)', [newId(), trip.id, date]);
      }
      return trip;
    },
    async listTrips(): Promise<Trip[]> {
      return (await db.all<TripRow>('SELECT * FROM trip ORDER BY startDate DESC')).map(toTrip);
    },
    async getTrip(id: Id): Promise<Trip | null> {
      const rows = await db.all<TripRow>('SELECT * FROM trip WHERE id = ?', [id]);
      return rows[0] ? toTrip(rows[0]) : null;
    },
    async updateTrip(t: Trip): Promise<void> {
      await db.run('UPDATE trip SET name=?, city=?, baseCurrency=?, rates=? WHERE id=?', [
        t.name, t.city, t.baseCurrency, JSON.stringify(t.rates), t.id,
      ]);
    },
    async deleteTrip(id: Id): Promise<void> {
      await db.run('DELETE FROM trip WHERE id = ?', [id]);
    },

    listDays(tripId: Id): Promise<Day[]> {
      return db.all<Day>('SELECT id, tripId, date FROM day WHERE tripId = ? ORDER BY date', [tripId]);
    },
    async getDay(id: Id): Promise<Day | null> {
      return (await db.all<Day>('SELECT id, tripId, date FROM day WHERE id = ?', [id]))[0] ?? null;
    },
    listDaysByDate(date: string): Promise<Day[]> {
      return db.all<Day>('SELECT id, tripId, date FROM day WHERE date = ?', [date]);
    },

    async listStops(dayId: Id): Promise<Stop[]> {
      return (await db.all<StopRow>(`SELECT ${stopCols} FROM stop WHERE dayId = ? ORDER BY "order"`, [dayId])).map(toStop);
    },
    async getStop(id: Id): Promise<Stop | null> {
      const row = (await db.all<StopRow>(`SELECT ${stopCols} FROM stop WHERE id = ?`, [id]))[0];
      return row ? toStop(row) : null;
    },
    /**
     * 그 날의 방문지 구성을 저장한다: 목록에 없는 방문지는 지우고, 새 방문지는 추가하고,
     * 이미 있는 방문지는 날짜와 순서만 바꾼다. 도착 기록·메모 등은 화면의 옛 사본으로 덮어쓰지 않는다.
     */
    saveStops(dayId: Id, stops: Stop[]): Promise<void> {
      return write(async () => {
        const keep = new Set(stops.map((s) => s.id));
        const existing = await db.all<{ id: Id }>('SELECT id FROM stop WHERE dayId = ?', [dayId]);
        for (const { id } of existing) if (!keep.has(id)) await db.run('DELETE FROM stop WHERE id = ?', [id]);
        for (const s of stops) {
          await db.run(
            `INSERT INTO stop (${stopCols}) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
             ON CONFLICT(id) DO UPDATE SET dayId=excluded.dayId, "order"=excluded."order"`,
            stopParams({ ...s, dayId }),
          );
        }
      });
    },
    /** 첫 도착만 기록한다. 기록했으면 true. */
    markStopArrived(id: Id, at: string, method: 'auto' | 'manual'): Promise<boolean> {
      return write(async () => {
        const rows = await db.all<{ arrivedAt: string | null }>('SELECT arrivedAt FROM stop WHERE id = ?', [id]);
        if (rows.length === 0 || rows[0].arrivedAt !== null) return false;
        await db.run('UPDATE stop SET arrivedAt=?, arrivalMethod=? WHERE id=? AND arrivedAt IS NULL', [at, method, id]);
        return true;
      });
    },
    /** 이미 도착한 방문지의 시간을 고친다. */
    async setStopArrivalTime(id: Id, at: string): Promise<void> {
      await db.run("UPDATE stop SET arrivedAt=?, arrivalMethod='manual' WHERE id=? AND arrivedAt IS NOT NULL", [at, id]);
    },
    async setStopMemo(id: Id, memo: string): Promise<void> {
      await db.run('UPDATE stop SET memo=? WHERE id=?', [memo, id]);
    },
    /** 계획에서 숨기거나 다시 넣는다. */
    async setStopSkipped(id: Id, skipped: boolean): Promise<void> {
      await db.run('UPDATE stop SET skipped=? WHERE id=?', [skipped ? 1 : 0, id]);
    },
    async setStopLegNote(id: Id, legNote: string): Promise<void> {
      await db.run('UPDATE stop SET legNote=? WHERE id=?', [legNote, id]);
    },
    async setStopPlanNote(id: Id, planNote: string): Promise<void> {
      await db.run('UPDATE stop SET planNote=? WHERE id=?', [planNote, id]);
    },
    async setStopPlannedTime(id: Id, plannedTime: string | null): Promise<void> {
      await db.run('UPDATE stop SET plannedTime=? WHERE id=?', [plannedTime, id]);
    },

    async listLegs(dayId: Id): Promise<Leg[]> {
      const rows = await db.all<LegRow>(
        'SELECT id, fromStopId, toStopId, mode, options, selectedOptionId FROM leg WHERE dayId = ? ORDER BY seq',
        [dayId],
      );
      return rows.map((r) => ({ ...r, options: JSON.parse(r.options) }));
    },
    saveLegs(dayId: Id, legs: Leg[]): Promise<void> {
      return write(async () => {
        await db.run('DELETE FROM leg WHERE dayId = ?', [dayId]);
        let seq = 0;
        for (const l of legs) {
          await db.run(
            'INSERT INTO leg (id, dayId, seq, fromStopId, toStopId, mode, options, selectedOptionId) VALUES (?,?,?,?,?,?,?,?)',
            [l.id, dayId, seq++, l.fromStopId, l.toStopId, l.mode, JSON.stringify(l.options), l.selectedOptionId],
          );
        }
      });
    },

    /** 그날의 이동 메모들 (출발 장소 순서, 그 안에서 적은 순서). */
    async listNotesForDay(dayId: Id): Promise<Note[]> {
      const rows = await db.all<NoteRow>(
        `SELECT n.id, n.stopId, n."order", n.text, n.done, n.memo FROM note n JOIN stop s ON s.id = n.stopId
         WHERE s.dayId = ? ORDER BY s."order", n."order"`,
        [dayId],
      );
      return rows.map(toNote);
    },
    async getNote(id: Id): Promise<Note | null> {
      const row = (await db.all<NoteRow>(`SELECT ${noteCols} FROM note WHERE id = ?`, [id]))[0];
      return row ? toNote(row) : null;
    },
    async addNote(stopId: Id, text: string): Promise<Note> {
      const last = await db.all<{ n: number | null }>('SELECT MAX("order") AS n FROM note WHERE stopId = ?', [stopId]);
      const note: Note = { id: newId(), stopId, order: (last[0]?.n ?? -1) + 1, text, done: false, memo: '' };
      await db.run(`INSERT INTO note (${noteCols}) VALUES (?,?,?,?,?,?)`, [note.id, stopId, note.order, text, 0, '']);
      return note;
    },
    /** 바꾼 칸만 저장한다. */
    async updateNote(id: Id, change: Partial<Pick<Note, 'text' | 'done' | 'memo'>>): Promise<void> {
      if (change.text !== undefined) await db.run('UPDATE note SET text=? WHERE id=?', [change.text, id]);
      if (change.done !== undefined) await db.run('UPDATE note SET done=? WHERE id=?', [change.done ? 1 : 0, id]);
      if (change.memo !== undefined) await db.run('UPDATE note SET memo=? WHERE id=?', [change.memo, id]);
    },
    /** 이동 메모를 지운다. 붙인 사진도 지우고, 비용은 그날의 비용으로 남긴다. 지운 사진 파일 이름을 돌려준다. */
    async deleteNote(id: Id): Promise<string[]> {
      const photos = await db.all<{ uri: string }>('SELECT uri FROM photo WHERE noteId = ?', [id]);
      await db.run('DELETE FROM photo WHERE noteId = ?', [id]);
      await db.run('UPDATE expense SET noteId=NULL WHERE noteId=?', [id]);
      await db.run('DELETE FROM note WHERE id = ?', [id]);
      return photos.map((p) => p.uri);
    },
    async listNotePhotos(noteId: Id): Promise<Photo[]> {
      const rows = await db.all<Omit<Photo, 'cover'> & { cover: number }>(
        'SELECT id, stopId, uri, takenAt, lat, lng, assetId, cover, noteId FROM photo WHERE noteId = ? ORDER BY takenAt',
        [noteId],
      );
      return rows.map((r) => ({ ...r, cover: r.cover === 1 }));
    },

    async addPhoto(p: Omit<Photo, 'id'>): Promise<Photo> {
      const photo: Photo = { ...p, assetId: p.assetId ?? null, cover: p.cover ?? false, noteId: p.noteId ?? null, id: newId() };
      await db.run('INSERT INTO photo (id, stopId, uri, takenAt, lat, lng, assetId, cover, noteId) VALUES (?,?,?,?,?,?,?,?,?)', [
        photo.id, photo.stopId, photo.uri, photo.takenAt, photo.lat, photo.lng, photo.assetId ?? null, photo.cover ? 1 : 0, photo.noteId ?? null,
      ]);
      return photo;
    },
    async listPhotos(stopId: Id): Promise<Photo[]> {
      const rows = await db.all<Omit<Photo, 'cover'> & { cover: number }>(
        'SELECT id, stopId, uri, takenAt, lat, lng, assetId, cover, noteId FROM photo WHERE stopId = ? AND noteId IS NULL ORDER BY takenAt',
        [stopId],
      );
      return rows.map((r) => ({ ...r, cover: r.cover === 1 }));
    },
    /** 장소 화면 머리에 쓸 사진으로 지정하거나 해제한다. */
    async setPhotoCover(id: Id, cover: boolean): Promise<void> {
      await db.run('UPDATE photo SET cover=? WHERE id=?', [cover ? 1 : 0, id]);
    },
    async deletePhoto(id: Id): Promise<void> {
      await db.run('DELETE FROM photo WHERE id = ?', [id]);
    },

    async addExpense(e: Omit<Expense, 'id'>): Promise<Expense> {
      const exp: Expense = { ...e, noteId: e.noteId ?? null, id: newId() };
      await db.run(
        'INSERT INTO expense (id, tripId, date, stopId, amount, currency, category, memo, noteId) VALUES (?,?,?,?,?,?,?,?,?)',
        [exp.id, exp.tripId, exp.date, exp.stopId, exp.amount, exp.currency, exp.category, exp.memo, exp.noteId],
      );
      return exp;
    },
    listExpenses(tripId: Id): Promise<Expense[]> {
      return db.all<Expense>(
        'SELECT id, tripId, date, stopId, amount, currency, category, memo, noteId FROM expense WHERE tripId = ? ORDER BY date, rowid',
        [tripId],
      );
    },
    async updateExpense(e: Expense): Promise<void> {
      await db.run('UPDATE expense SET date=?, stopId=?, amount=?, currency=?, category=?, memo=? WHERE id=?', [
        e.date, e.stopId, e.amount, e.currency, e.category, e.memo, e.id,
      ]);
    },
    /** 방문지를 다른 날로 옮겼을 때 그 방문지의 비용 날짜도 옮긴다. */
    async setExpenseDateForStop(stopId: Id, date: string): Promise<void> {
      await db.run('UPDATE expense SET date=? WHERE stopId=?', [date, stopId]);
      // 그 장소에서 출발하는 이동 메모의 비용도 함께 옮긴다
      await db.run('UPDATE expense SET date=? WHERE noteId IN (SELECT id FROM note WHERE stopId=?)', [date, stopId]);
    },
    async deleteExpense(id: Id): Promise<void> {
      await db.run('DELETE FROM expense WHERE id = ?', [id]);
    },
  };
}

export type Repo = ReturnType<typeof makeRepo>;
