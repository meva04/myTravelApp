// 이동 메모는 장소와 같은 급이라 장소가 아니라 날에 속한다. 순서는 장소의 order 와 같은 줄을 쓴다.
export const NOTE_TABLE = `CREATE TABLE IF NOT EXISTS note (
    id TEXT PRIMARY KEY, dayId TEXT NOT NULL REFERENCES day(id) ON DELETE CASCADE,
    "order" INTEGER NOT NULL, text TEXT NOT NULL, done INTEGER NOT NULL DEFAULT 0,
    memo TEXT NOT NULL DEFAULT '')`;
// 이동 메모 사진은 장소 없이 메모에만 붙는다.
export const PHOTO_TABLE = `CREATE TABLE IF NOT EXISTS photo (
    id TEXT PRIMARY KEY, stopId TEXT REFERENCES stop(id) ON DELETE CASCADE,
    uri TEXT NOT NULL, takenAt TEXT NOT NULL, lat REAL, lng REAL, assetId TEXT,
    cover INTEGER NOT NULL DEFAULT 0, noteId TEXT REFERENCES note(id) ON DELETE CASCADE)`;

export const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS trip (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, city TEXT NOT NULL,
    startDate TEXT NOT NULL, endDate TEXT NOT NULL,
    baseCurrency TEXT NOT NULL, rates TEXT NOT NULL DEFAULT '{}', members TEXT NOT NULL DEFAULT '[]')`,
  `CREATE TABLE IF NOT EXISTS day (
    id TEXT PRIMARY KEY, tripId TEXT NOT NULL REFERENCES trip(id) ON DELETE CASCADE,
    date TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS stop (
    id TEXT PRIMARY KEY, dayId TEXT NOT NULL REFERENCES day(id) ON DELETE CASCADE,
    "order" INTEGER NOT NULL, placeId TEXT, name TEXT NOT NULL,
    lat REAL NOT NULL, lng REAL NOT NULL, plannedTime TEXT,
    arrivedAt TEXT, arrivalMethod TEXT, memo TEXT NOT NULL DEFAULT '',
    planNote TEXT NOT NULL DEFAULT '', skipped INTEGER NOT NULL DEFAULT 0,
    legNote TEXT NOT NULL DEFAULT '', kind TEXT, bookingId TEXT)`,
  `CREATE TABLE IF NOT EXISTS leg (
    id TEXT PRIMARY KEY, dayId TEXT NOT NULL REFERENCES day(id) ON DELETE CASCADE,
    seq INTEGER NOT NULL, fromStopId TEXT NOT NULL, toStopId TEXT NOT NULL,
    mode TEXT NOT NULL, options TEXT NOT NULL, selectedOptionId TEXT)`,
  NOTE_TABLE,
  PHOTO_TABLE,
  `CREATE TABLE IF NOT EXISTS expense (
    id TEXT PRIMARY KEY, tripId TEXT NOT NULL REFERENCES trip(id) ON DELETE CASCADE,
    date TEXT NOT NULL, stopId TEXT REFERENCES stop(id) ON DELETE SET NULL,
    amount REAL NOT NULL, currency TEXT NOT NULL, category TEXT NOT NULL,
    memo TEXT NOT NULL DEFAULT '', noteId TEXT, paidBy TEXT, splitWith TEXT)`,
  `CREATE TABLE IF NOT EXISTS booking (
    id TEXT PRIMARY KEY, tripId TEXT NOT NULL REFERENCES trip(id) ON DELETE CASCADE,
    kind TEXT NOT NULL, data TEXT NOT NULL)`,
];

/** 예전 버전에서 만든 DB 에 나중에 생긴 칸을 더한다: [표, 칸, 정의] */
export const ADDED_COLUMNS: [string, string, string][] = [
  ['stop', 'planNote', "TEXT NOT NULL DEFAULT ''"],
  ['photo', 'assetId', 'TEXT'],
  ['stop', 'skipped', 'INTEGER NOT NULL DEFAULT 0'],
  ['stop', 'legNote', "TEXT NOT NULL DEFAULT ''"],
  ['photo', 'cover', 'INTEGER NOT NULL DEFAULT 0'],
  ['photo', 'noteId', 'TEXT'],
  ['expense', 'noteId', 'TEXT'],
  ['stop', 'kind', 'TEXT'],
  ['stop', 'bookingId', 'TEXT'],
  ['trip', 'members', "TEXT NOT NULL DEFAULT '[]'"],
  ['expense', 'paidBy', 'TEXT'],
  ['expense', 'splitWith', 'TEXT'],
  ['trip', 'localCurrency', 'TEXT'],
  ['expense', 'rate', 'REAL'],
];
