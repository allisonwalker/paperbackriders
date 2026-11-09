import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { magicLink } from "better-auth/plugins/magic-link";
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { deliverMagicLink, safeAuthLog } from "./auth-mail";
import {
  CLOSED_AUTH_PATHS,
  allowUserCreate,
  allowUserUpdate,
  allowVerificationCreate,
  assertServerOnlyAuthEnv,
  authSecurityOptions,
  requireAuthSecret,
  type AuthEnv,
} from "./auth-policy";
import { getDb } from "./db/client";
import { authTables } from "./db/auth-schema";

export { asRecordKeeper, RecordKeeperRequiredError, requireRecordKeeper } from "./record-keeper";

let auth: ReturnType<typeof createAuth> | undefined;

export function getAuth(): ReturnType<typeof createAuth> {
  auth ??= createAuth();
  return auth;
}

export function createAuth(env: AuthEnv = process.env) {
  assertServerOnlyAuthEnv(env);
  const security = authSecurityOptions(env);
  const allowlisted = env.RECORD_KEEPER_EMAIL;

  return betterAuth({
    secret: requireAuthSecret(env),
    baseURL: security.baseURL,
    database: drizzleAdapter(getDb(), {
      provider: "pg",
      schema: authTables,
    }),
    emailAndPassword: security.emailAndPassword,
    session: security.session,
    telemetry: { enabled: false },
    advanced: security.advanced,
    disabledPaths: [...CLOSED_AUTH_PATHS],
    databaseHooks: {
      user: {
        create: {
          before: async (user) => (allowUserCreate(user, allowlisted) ? undefined : false),
        },
        update: {
          before: async (user) => (allowUserUpdate(user, allowlisted) ? undefined : false),
        },
      },
      verification: {
        create: {
          before: async (verification) => (allowVerificationCreate(verification, allowlisted) ? undefined : false),
        },
      },
    },
    plugins: [
      magicLink({
        expiresIn: 60 * 5,
        storeToken: "hashed",
        // The first accepted link creates the one user. Creation is refused
        // for every other address by the user hook above. Password sign-up stays off.
        disableSignUp: false,
        sendMagicLink: async ({ email, url }) => {
          await deliverMagicLink({ email, url, env });
        },
      }),
      nextCookies(),
    ],
    logger: {
      level: "error",
      log: (level, message, ...args) => {
        const line = safeAuthLog(message, args, env);
        if (level === "error") console.error(line);
        else if (level === "warn") console.warn(line);
        else console.info(line);
      },
    },
  });
}
