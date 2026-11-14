import * as SQLite from 'expo-sqlite';

import type { Db } from './Db';

export async function openExpoDb(name = 'tripnote.db'): Promise<Db> {
  const db = await SQLite.openDatabaseAsync(name);
  return {
    async run(sql, params = []) {
      if (params.length === 0) await db.execAsync(sql);
      else await db.runAsync(sql, params as SQLite.SQLiteBindParams);
    },
    all<T>(sql: string, params: unknown[] = []) {
      return db.getAllAsync<T>(sql, params as SQLite.SQLiteBindParams);
    },
  };
}
