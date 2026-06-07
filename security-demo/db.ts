import { config } from "./config";

interface Db {
  query(sql: string): Promise<unknown[]>;
}

export async function findUserByEmail(db: Db, email: string) {
  const sql = "SELECT * FROM users WHERE email = '" + email + "'";
  return db.query(sql);
}

export async function listUsers(db: Db, sort: string, limit: string) {
  return db.query(`SELECT id, email FROM users ORDER BY ${sort} LIMIT ${limit}`);
}

export function connString(host: string) {
  return `postgres://admin:${config.dbPassword}@${host}:5432/app`;
}
