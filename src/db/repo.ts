import type { Day, Expense, Id, Leg, Photo, Stop, Trip } from '@/domain/types';

import type { Db } from './Db';
import { SCHEMA } from './schema';

type TripRow = Omit<Trip, 'rates'> & { rates: string };
type LegRow = Omit<Leg, 'options'> & { options: string };

const toTrip = (r: TripRow): Trip => ({ ...r, rates: JSON.parse(r.rates) });

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
  const stopCols = 'id, dayId, "order", placeId, name, lat, lng, plannedTime, arrivedAt, arrivalMethod, memo';
  const stopParams = (s: Stop) => [
    s.id, s.dayId, s.order, s.placeId, s.name, s.lat, s.lng, s.plannedTime, s.arrivedAt, s.arrivalMethod, s.memo,
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

    listStops(dayId: Id): Promise<Stop[]> {
      return db.all<Stop>(`SELECT ${stopCols} FROM stop WHERE dayId = ? ORDER BY "order"`, [dayId]);
    },
    async getStop(id: Id): Promise<Stop | null> {
      return (await db.all<Stop>(`SELECT ${stopCols} FROM stop WHERE id = ?`, [id]))[0] ?? null;
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
            `INSERT INTO stop (${stopCols}) VALUES (?,?,?,?,?,?,?,?,?,?,?)
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

    async addPhoto(p: Omit<Photo, 'id'>): Promise<Photo> {
      const photo: Photo = { ...p, id: newId() };
      await db.run('INSERT INTO photo (id, stopId, uri, takenAt, lat, lng) VALUES (?,?,?,?,?,?)', [
        photo.id, photo.stopId, photo.uri, photo.takenAt, photo.lat, photo.lng,
      ]);
      return photo;
    },
    listPhotos(stopId: Id): Promise<Photo[]> {
      return db.all<Photo>('SELECT id, stopId, uri, takenAt, lat, lng FROM photo WHERE stopId = ? ORDER BY takenAt', [stopId]);
    },
    async deletePhoto(id: Id): Promise<void> {
      await db.run('DELETE FROM photo WHERE id = ?', [id]);
    },

    async addExpense(e: Omit<Expense, 'id'>): Promise<Expense> {
      const exp: Expense = { ...e, id: newId() };
      await db.run(
        'INSERT INTO expense (id, tripId, date, stopId, amount, currency, category, memo) VALUES (?,?,?,?,?,?,?,?)',
        [exp.id, exp.tripId, exp.date, exp.stopId, exp.amount, exp.currency, exp.category, exp.memo],
      );
      return exp;
    },
    listExpenses(tripId: Id): Promise<Expense[]> {
      return db.all<Expense>(
        'SELECT id, tripId, date, stopId, amount, currency, category, memo FROM expense WHERE tripId = ? ORDER BY date, rowid',
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
    },
    async deleteExpense(id: Id): Promise<void> {
      await db.run('DELETE FROM expense WHERE id = ?', [id]);
    },
  };
}

export type Repo = ReturnType<typeof makeRepo>;
