import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { assertRuntimeDatabase } from "../database-isolation";
import { account, session, user, verification } from "./auth-schema";
import * as clubSchema from "./schema";

const schema = { ...clubSchema, user, session, account, verification };

type Database = PostgresJsDatabase<typeof schema>;

let database: Database | undefined;

export function getDb(): Database {
  const url = assertRuntimeDatabase(process.env);

  if (!database) {
    const client = postgres(url, { max: 5, prepare: false });
    database = drizzle(client, { schema });
  }

  return database;
}
