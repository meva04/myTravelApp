// 테스트 전용: 메모리 SQLite 를 Db 인터페이스로 감싼다.
import Database from 'better-sqlite3';

import type { Db } from './Db';

export function makeTestDb(): Db {
  const db = new Database(':memory:');
  return {
    async run(sql, params = []) {
      if (params.length === 0) db.exec(sql);
      else db.prepare(sql).run(...(params as never[]));
    },
    async all<T>(sql: string, params: unknown[] = []) {
      return db.prepare(sql).all(...(params as never[])) as T[];
    },
  };
}
