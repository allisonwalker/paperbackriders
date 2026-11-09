import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { account, session, user, verification } from "./auth-schema";
import * as clubSchema from "./schema";

const schema = { ...clubSchema, user, session, account, verification };

type Database = PostgresJsDatabase<typeof schema>;

let database: Database | undefined;

export function getDb(): Database {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }

  if (!database) {
    const client = postgres(url, { max: 5, prepare: false });
    database = drizzle(client, { schema });
  }

  return database;
}
