import { parseChecklist } from '@/domain/checklist';
import type { Booking, Day, Expense, Id, Leg, Note, Photo, SeqItem, Stop, Trip } from '@/domain/types';

import type { Db } from './Db';
import { ADDED_COLUMNS, NOTE_TABLE, PHOTO_TABLE, SCHEMA } from './schema';

type TripRow = Omit<Trip, 'rates' | 'members'> & { rates: string; members?: string };
type ExpenseRow = Omit<Expense, 'splitWith'> & { splitWith: string | null };
const toExpense = (r: ExpenseRow): Expense => ({ ...r, paidBy: r.paidBy ?? null, splitWith: r.splitWith ? JSON.parse(r.splitWith) : null });
const expenseCols = 'id, tripId, date, stopId, amount, currency, category, memo, noteId, paidBy, splitWith';
type LegRow = Omit<Leg, 'options'> & { options: string };

type StopRow = Omit<Stop, 'skipped'> & { skipped: number };
type NoteRow = Omit<Note, 'done'> & { done: number };
const toNote = (r: NoteRow): Note => ({ ...r, done: r.done === 1 });
const noteCols = 'id, dayId, "order", text, done, memo';
type PhotoRow = Omit<Photo, 'cover'> & { cover: number };
const toPhoto = (r: PhotoRow): Photo => ({ ...r, cover: r.cover === 1 });
const photoCols = 'id, stopId, uri, takenAt, lat, lng, assetId, cover, noteId';

const toTrip = (r: TripRow): Trip => ({ ...r, rates: JSON.parse(r.rates), members: JSON.parse(r.members ?? '[]') });
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
  const stopCols = 'id, dayId, "order", placeId, name, lat, lng, plannedTime, arrivedAt, arrivalMethod, memo, planNote, skipped, legNote, kind, bookingId';
  const stopParams = (s: Stop) => [
    s.id, s.dayId, s.order, s.placeId, s.name, s.lat, s.lng, s.plannedTime, s.arrivedAt, s.arrivalMethod, s.memo, s.planNote, s.skipped ? 1 : 0, s.legNote,
    s.kind ?? null, s.bookingId ?? null,
  ];

  /** 그날 일정의 칸들 (장소와 이동 메모를 한 줄로). */
  async function readSequence(dayId: Id): Promise<SeqItem[]> {
    return db.all<SeqItem>(
      `SELECT 'stop' AS kind, id, "order" AS o FROM stop WHERE dayId = ?
       UNION ALL SELECT 'note' AS kind, id, "order" AS o FROM note WHERE dayId = ? ORDER BY o, kind DESC`,
      [dayId, dayId],
    ).then((rows) => rows.map(({ kind, id }) => ({ kind, id }) as SeqItem));
  }
  /** 칸 순서대로 order 를 다시 매긴다. */
  async function writeSequence(items: SeqItem[]): Promise<void> {
    let i = 0;
    for (const it of items) await db.run(`UPDATE ${it.kind === 'stop' ? 'stop' : 'note'} SET "order"=? WHERE id=?`, [i++, it.id]);
  }
  /** 장소 뒤(그 뒤에 이어진 이동 메모들 다음)에 이동 메모를 끼운다. after 가 null 이면 맨 앞. */
  async function insertNotes(dayId: Id, after: Id | null, texts: string[]): Promise<Note[]> {
    const seq = await readSequence(dayId);
    let at = 0;
    if (after) {
      at = seq.findIndex((x) => x.id === after) + 1;
      while (at > 0 && at < seq.length && seq[at].kind === 'note') at++;
      if (at === 0) at = seq.length;
    }
    const notes: Note[] = texts.map((text) => ({ id: newId(), dayId, order: 0, text, done: false, memo: '' }));
    for (const n of notes) await db.run(`INSERT INTO note (${noteCols}) VALUES (?,?,?,?,?,?)`, [n.id, dayId, 0, n.text, 0, '']);
    const next = [...seq.slice(0, at), ...notes.map((n) => ({ kind: 'note', id: n.id }) as SeqItem), ...seq.slice(at)];
    await writeSequence(next);
    return notes.map((n) => ({ ...n, order: next.findIndex((x) => x.id === n.id) }));
  }
  async function tableHas(table: string, column: string): Promise<{ notnull: number } | undefined> {
    return (await db.all<{ name: string; notnull: number }>(`PRAGMA table_info(${table})`)).find((c) => c.name === column);
  }

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
      await db.run('PRAGMA foreign_keys = OFF');
      for (const sql of SCHEMA) await db.run(sql);
      for (const [table, column, def] of ADDED_COLUMNS) {
        if (!(await tableHas(table, column))) await db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${def}`);
      }
      // 예전에는 이동 메모가 출발 장소에 속했다. 날에 속하게 바꾸고, 장소 바로 뒤 자리에 놓는다.
      if (await tableHas('note', 'stopId')) {
        type Old = { id: Id; stopId: Id; text: string; done: number; memo: string; dayId: Id };
        const old = await db.all<Old>(
          'SELECT n.id, n.stopId, n.text, n.done, n.memo, s.dayId FROM note n JOIN stop s ON s.id = n.stopId ORDER BY s."order", n."order"',
        );
        await db.run('ALTER TABLE note RENAME TO note_old');
        await db.run(NOTE_TABLE);
        for (const n of old) await db.run(`INSERT INTO note (${noteCols}) VALUES (?,?,?,?,?,?)`, [n.id, n.dayId, 0, n.text, n.done, n.memo]);
        await db.run('DROP TABLE note_old');
        for (const { dayId } of await db.all<{ dayId: Id }>('SELECT DISTINCT dayId FROM stop')) {
          const stops = await db.all<{ id: Id }>('SELECT id FROM stop WHERE dayId = ? ORDER BY "order"', [dayId]);
          const seq: SeqItem[] = [];
          for (const s of stops) {
            seq.push({ kind: 'stop', id: s.id });
            for (const n of old.filter((x) => x.stopId === s.id)) seq.push({ kind: 'note', id: n.id });
          }
          await writeSequence(seq);
        }
      }
      // 이동 메모 사진은 장소 없이도 있을 수 있게 (예전에는 출발 장소에 묶였다).
      if ((await tableHas('photo', 'stopId'))?.notnull === 1) {
        await db.run('ALTER TABLE photo RENAME TO photo_old');
        await db.run(PHOTO_TABLE);
        await db.run(
          `INSERT INTO photo (${photoCols}) SELECT id, CASE WHEN noteId IS NULL THEN stopId ELSE NULL END, uri, takenAt, lat, lng, assetId, cover, noteId FROM photo_old`,
        );
        await db.run('DROP TABLE photo_old');
      }
      // 더 예전에는 이동 메모를 장소의 legNote 칸에 체크리스트 글로 두었다. 항목마다 이동 메모로 옮긴다.
      for (const old of await db.all<{ id: Id; dayId: Id; legNote: string }>("SELECT id, dayId, legNote FROM stop WHERE legNote != ''")) {
        const items = parseChecklist(old.legNote);
        const added = await insertNotes(old.dayId, old.id, items.map((it) => it.text));
        for (const [i, n] of added.entries()) if (items[i].done) await db.run('UPDATE note SET done=1 WHERE id=?', [n.id]);
        await db.run("UPDATE stop SET legNote='' WHERE id=?", [old.id]);
      }
      await db.run('PRAGMA foreign_keys = ON');
    },

    async createTrip(input: Omit<Trip, 'id' | 'rates'>): Promise<Trip> {
      const trip: Trip = { ...input, id: newId(), rates: {}, members: input.members ?? [] };
      await db.run(
        'INSERT INTO trip (id, name, city, startDate, endDate, baseCurrency, rates, members) VALUES (?,?,?,?,?,?,?,?)',
        [trip.id, trip.name, trip.city, trip.startDate, trip.endDate, trip.baseCurrency, '{}', JSON.stringify(trip.members)],
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
      await db.run('UPDATE trip SET name=?, city=?, baseCurrency=?, rates=?, members=? WHERE id=?', [
        t.name, t.city, t.baseCurrency, JSON.stringify(t.rates), JSON.stringify(t.members ?? []), t.id,
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
     * 이동 메모는 제자리에 두고, 장소 자리들에 새 순서대로 장소를 채운다. 새 장소는 맨 끝에 붙는다.
     * sequence 를 주면 장소와 메모를 그 순서대로 놓는다.
     */
    saveStops(dayId: Id, stops: Stop[], sequence?: SeqItem[]): Promise<void> {
      return write(async () => {
        const before = await readSequence(dayId);
        const keep = new Set(stops.map((s) => s.id));
        for (const it of before) if (it.kind === 'stop' && !keep.has(it.id)) await db.run('DELETE FROM stop WHERE id = ?', [it.id]);
        for (const s of stops) {
          await db.run(
            `INSERT INTO stop (${stopCols}) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
             ON CONFLICT(id) DO UPDATE SET dayId=excluded.dayId, "order"=excluded."order"`,
            stopParams({ ...s, dayId }),
          );
        }
        let seq: SeqItem[];
        if (sequence) seq = sequence;
        else {
          const queue = stops.map((s) => ({ kind: 'stop', id: s.id }) as SeqItem);
          seq = [];
          for (const it of before) {
            if (it.kind === 'note') seq.push(it);
            else if (keep.has(it.id)) seq.push(queue.shift()!);
          }
          seq.push(...queue);
        }
        await writeSequence(seq);
      });
    },
    /** 그날 일정의 칸 순서 (장소와 이동 메모). */
    listSequence(dayId: Id): Promise<SeqItem[]> {
      return readSequence(dayId);
    },
    /** 장소와 이동 메모를 함께 끌어 옮긴 순서를 저장한다. */
    saveSequence(dayId: Id, items: SeqItem[]): Promise<void> {
      return write(async () => {
        const known = new Set((await readSequence(dayId)).map((x) => x.id));
        await writeSequence(items.filter((x) => known.has(x.id)));
      });
    },
    async listStopsByBooking(bookingId: Id): Promise<Stop[]> {
      return (await db.all<StopRow>(`SELECT ${stopCols} FROM stop WHERE bookingId = ?`, [bookingId])).map(toStop);
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

    /** 그날의 이동 메모들 (일정 순서). */
    async listNotesForDay(dayId: Id): Promise<Note[]> {
      return (await db.all<NoteRow>(`SELECT ${noteCols} FROM note WHERE dayId = ? ORDER BY "order"`, [dayId])).map(toNote);
    },
    async getNote(id: Id): Promise<Note | null> {
      const row = (await db.all<NoteRow>(`SELECT ${noteCols} FROM note WHERE id = ?`, [id]))[0];
      return row ? toNote(row) : null;
    },
    /** 그 장소 뒤에 (이미 있는 이동 메모들 다음에) 이동 메모를 더한다. after 가 null 이면 그날 맨 앞. */
    addNotes(dayId: Id, after: Id | null, texts: string[]): Promise<Note[]> {
      return write(() => insertNotes(dayId, after, texts));
    },
    async addNote(dayId: Id, after: Id | null, text: string): Promise<Note> {
      return (await write(() => insertNotes(dayId, after, [text])))[0];
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
      return (await db.all<PhotoRow>(`SELECT ${photoCols} FROM photo WHERE noteId = ? ORDER BY takenAt`, [noteId])).map(toPhoto);
    },

    async addPhoto(p: Omit<Photo, 'id'>): Promise<Photo> {
      const photo: Photo = { ...p, assetId: p.assetId ?? null, cover: p.cover ?? false, noteId: p.noteId ?? null, id: newId() };
      await db.run(`INSERT INTO photo (${photoCols}) VALUES (?,?,?,?,?,?,?,?,?)`, [
        photo.id, photo.stopId, photo.uri, photo.takenAt, photo.lat, photo.lng, photo.assetId ?? null, photo.cover ? 1 : 0, photo.noteId ?? null,
      ]);
      return photo;
    },
    async listPhotos(stopId: Id): Promise<Photo[]> {
      return (await db.all<PhotoRow>(`SELECT ${photoCols} FROM photo WHERE stopId = ? AND noteId IS NULL ORDER BY takenAt`, [stopId])).map(toPhoto);
    },
    /** 그날의 모든 장소·이동 메모 사진 (썸네일·일기용). */
    async listPhotosForDay(dayId: Id): Promise<Photo[]> {
      return (
        await db.all<PhotoRow>(
          `SELECT ${photoCols.split(', ').map((c) => `p.${c}`).join(', ')} FROM photo p
           LEFT JOIN stop s ON s.id = p.stopId LEFT JOIN note n ON n.id = p.noteId
           WHERE s.dayId = ? OR n.dayId = ? ORDER BY p.takenAt`,
          [dayId, dayId],
        )
      ).map(toPhoto);
    },
    /** 장소 화면 머리에 쓸 사진으로 지정하거나 해제한다. */
    async setPhotoCover(id: Id, cover: boolean): Promise<void> {
      await db.run('UPDATE photo SET cover=? WHERE id=?', [cover ? 1 : 0, id]);
    },
    async deletePhoto(id: Id): Promise<void> {
      await db.run('DELETE FROM photo WHERE id = ?', [id]);
    },

    async addExpense(e: Omit<Expense, 'id'>): Promise<Expense> {
      const exp: Expense = { ...e, noteId: e.noteId ?? null, paidBy: e.paidBy ?? null, splitWith: e.splitWith ?? null, id: newId() };
      await db.run(`INSERT INTO expense (${expenseCols}) VALUES (?,?,?,?,?,?,?,?,?,?,?)`, [
        exp.id, exp.tripId, exp.date, exp.stopId, exp.amount, exp.currency, exp.category, exp.memo, exp.noteId, exp.paidBy,
        exp.splitWith ? JSON.stringify(exp.splitWith) : null,
      ]);
      return exp;
    },
    async listExpenses(tripId: Id): Promise<Expense[]> {
      return (await db.all<ExpenseRow>(`SELECT ${expenseCols} FROM expense WHERE tripId = ? ORDER BY date, rowid`, [tripId])).map(toExpense);
    },
    async updateExpense(e: Expense): Promise<void> {
      await db.run('UPDATE expense SET date=?, stopId=?, amount=?, currency=?, category=?, memo=?, paidBy=?, splitWith=? WHERE id=?', [
        e.date, e.stopId, e.amount, e.currency, e.category, e.memo, e.paidBy ?? null, e.splitWith ? JSON.stringify(e.splitWith) : null, e.id,
      ]);
    },
    /** 방문지를 다른 날로 옮겼을 때 그 방문지의 비용 날짜도 옮긴다. */
    async setExpenseDateForStop(stopId: Id, date: string): Promise<void> {
      await db.run('UPDATE expense SET date=? WHERE stopId=?', [date, stopId]);
    },
    async deleteExpense(id: Id): Promise<void> {
      await db.run('DELETE FROM expense WHERE id = ?', [id]);
    },

    async listBookings(tripId: Id): Promise<Booking[]> {
      const rows = await db.all<{ id: Id; tripId: Id; kind: string; data: string }>('SELECT id, tripId, kind, data FROM booking WHERE tripId = ? ORDER BY rowid', [tripId]);
      return rows.map((r) => ({ ...JSON.parse(r.data), id: r.id, tripId: r.tripId, kind: r.kind }) as Booking);
    },
    async getBooking(id: Id): Promise<Booking | null> {
      const r = (await db.all<{ id: Id; tripId: Id; kind: string; data: string }>('SELECT id, tripId, kind, data FROM booking WHERE id = ?', [id]))[0];
      return r ? ({ ...JSON.parse(r.data), id: r.id, tripId: r.tripId, kind: r.kind } as Booking) : null;
    },
    async saveBooking(b: Booking): Promise<void> {
      const { id, tripId, kind, ...data } = b;
      await db.run('INSERT INTO booking (id, tripId, kind, data) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET kind=excluded.kind, data=excluded.data', [
        id, tripId, kind, JSON.stringify(data),
      ]);
    },
    async deleteBooking(id: Id): Promise<void> {
      await db.run('DELETE FROM booking WHERE id = ?', [id]);
    },
  };
}

export type Repo = ReturnType<typeof makeRepo>;
