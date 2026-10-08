import { Pool } from "pg";

export function createPostgresPool(): Pool {
  return new Pool({ connectionString: process.env.DATABASE_URL });
}
