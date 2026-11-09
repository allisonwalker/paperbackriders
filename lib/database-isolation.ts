/**
 * Preview and local development open their own database. Only a Vercel
 * production deployment may use the production host. The one-time import is
 * the local exception, and it never runs on a deployment.
 */

export type DeploymentTarget = "production" | "preview" | "development";

export type ProcessEnv = {
  [key: string]: string | undefined;
};

const DATABASE_URL_MESSAGE = "DATABASE_URL is not a database URL";
const PRODUCTION_HOST_MESSAGE = "PRODUCTION_DATABASE_HOST is not a database host";

export function deploymentTarget(env: ProcessEnv): DeploymentTarget {
  if (env.VERCEL !== "1") return "development";
  if (env.VERCEL_ENV === "production") return "production";
  if (env.VERCEL_ENV === "preview") return "preview";
  return "development";
}

/**
 * Connection string for this process, or a throw before any client is opened.
 * Production is the Vercel production deployment only. Anywhere else, the
 * database host must differ from PRODUCTION_DATABASE_HOST.
 */
export function assertRuntimeDatabase(env: ProcessEnv): string {
  const url = requireDatabaseUrl(env);
  if (deploymentTarget(env) === "production") return url;
  if (databaseEndpoint(url) === productionEndpoint(env)) {
    throw new Error("This environment must not use the production database");
  }
  return url;
}

/**
 * The history and venue imports run on a trusted machine, against production
 * only, after a restore of that catalog has been named. A preview, a Vercel
 * build, and a local database all refuse.
 */
export function assertProductionImport(env: ProcessEnv): void {
  if (env.VERCEL === "1" || env.VERCEL_ENV?.trim()) {
    throw new Error("The import does not run on a deployment");
  }
  const url = requireDatabaseUrl(env);
  if (databaseEndpoint(url) !== productionEndpoint(env)) {
    throw new Error("The import runs only against the production database");
  }
  assertCatalogRestore(env);
}

/**
 * The backup this import waits on is the production catalog. Preview and local
 * databases are never that copy. The restore host is a different database, and
 * it carries no user or password.
 */
export function assertCatalogRestore(env: ProcessEnv): void {
  const restore = catalogRestoreEndpoint(env);
  if (restore === productionEndpoint(env)) {
    throw new Error("A restore must use a non-production database");
  }
}

function catalogRestoreEndpoint(env: ProcessEnv): string {
  const raw = env.CATALOG_RESTORE_HOST?.trim();
  if (!raw) throw new Error("The production catalog has no confirmed restore");
  return endpointFromHost(readHost(raw, "CATALOG_RESTORE_HOST is not a database host"));
}

function requireDatabaseUrl(env: ProcessEnv): string {
  const url = env.DATABASE_URL?.trim();
  if (!url) throw new Error("DATABASE_URL is not set");
  return url;
}

function productionEndpoint(env: ProcessEnv): string {
  const raw = env.PRODUCTION_DATABASE_HOST?.trim();
  if (!raw) throw new Error("PRODUCTION_DATABASE_HOST is not set");
  return endpointFromHost(readProductionHost(raw));
}

function databaseEndpoint(url: string): string {
  return endpointFromHost(readDatabaseHost(url));
}

function readDatabaseHost(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(DATABASE_URL_MESSAGE);
  }
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error(DATABASE_URL_MESSAGE);
  }
  if (!parsed.hostname) throw new Error(DATABASE_URL_MESSAGE);
  return parsed.hostname;
}

function readProductionHost(value: string): string {
  return readHost(value, PRODUCTION_HOST_MESSAGE);
}

function readHost(value: string, message: string): string {
  if (value.includes("://")) {
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      throw new Error(message);
    }
    if ((parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") || !parsed.hostname) {
      throw new Error(message);
    }
    return parsed.hostname;
  }

  const host = value.replace(/:\d+$/, "").replace(/\.$/, "");
  if (!host || /[\s/@?#]/.test(host)) throw new Error(message);
  return host;
}

/** Direct and pooled Neon hosts are one branch. The pooler suffix is not a different database. */
function endpointFromHost(host: string): string {
  const labels = host.toLowerCase().replace(/\.$/, "").split(".");
  const first = labels[0];
  if (!first) throw new Error(DATABASE_URL_MESSAGE);
  if (first.endsWith("-pooler")) labels[0] = first.slice(0, -"-pooler".length);
  return labels.join(".");
}
