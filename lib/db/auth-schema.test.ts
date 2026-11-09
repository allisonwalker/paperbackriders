import { getTableColumns, getTableName } from "drizzle-orm";
import { getTableConfig, PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, test } from "vitest";
import { account, authTables, session, user, verification } from "./auth-schema";
import { meetings, picks } from "./schema";

describe("auth tables", () => {
  test("stores the session in Postgres and has no member table", () => {
    expect(getTableName(user)).toBe("user");
    expect(getTableName(session)).toBe("session");
    expect(getTableName(account)).toBe("account");
    expect(getTableName(verification)).toBe("verification");
    expect(Object.keys(authTables).sort()).toEqual(["account", "session", "user", "verification"]);

    const names = [user, session, account, verification, picks, meetings].map((table) => getTableName(table));
    expect(names).not.toContain("member");
    expect(names).not.toContain("members");
    expect(Object.keys(getTableColumns(session))).toContain("token");
  });

  test("refuses to store a password", () => {
    const dialect = new PgDialect();
    const checks = getTableConfig(account).checks.map((constraint) => ({
      name: constraint.name,
      sql: dialect.sqlToQuery(constraint.value).sql,
    }));
    const password = checks.find((constraint) => constraint.name === "account_password_unused");
    expect(password?.sql).toContain("password");
    expect(password?.sql.toLowerCase()).toContain("is null");
  });
});
