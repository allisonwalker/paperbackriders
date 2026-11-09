import { isRecordKeeperEmail, logAuthFailure, redactAuthText, authSecretValues, type AuthEnv } from "./auth-policy";

export class MagicLinkClosedError extends Error {
  constructor() {
    super("Sign-in is closed.");
    this.name = "MagicLinkClosedError";
  }
}

export class MagicLinkDeliveryError extends Error {
  constructor() {
    super("The sign-in email could not be sent.");
    this.name = "MagicLinkDeliveryError";
  }
}

const RESEND_URL = "https://api.resend.com/emails";

export function recordKeeperMagicLink(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new MagicLinkDeliveryError();
  }
  if (!parsed.pathname.endsWith("/magic-link/verify") || !parsed.searchParams.get("token")) {
    throw new MagicLinkDeliveryError();
  }
  parsed.searchParams.set("callbackURL", "/edit");
  parsed.searchParams.delete("newUserCallbackURL");
  parsed.searchParams.delete("errorCallbackURL");
  return parsed.toString();
}

export async function deliverMagicLink(input: {
  email: string;
  url: string;
  env: AuthEnv;
  fetch?: typeof fetch;
}): Promise<void> {
  if (!isRecordKeeperEmail(input.email, input.env.RECORD_KEEPER_EMAIL)) {
    throw new MagicLinkClosedError();
  }

  const apiKey = input.env.RESEND_API_KEY?.trim();
  const from = input.env.RESEND_FROM?.trim();
  if (!apiKey || !from) {
    throw new MagicLinkDeliveryError();
  }

  const link = recordKeeperMagicLink(input.url);
  const send = input.fetch ?? fetch;
  let response: Response;
  try {
    response = await send(RESEND_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [input.email.trim().toLowerCase()],
        subject: "Sign in to Paperback Riders",
        text: [
          "Sign in to Paperback Riders.",
          "",
          link,
          "",
          "This link expires in five minutes. If you did not ask for it, ignore this email.",
        ].join("\n"),
      }),
    });
  } catch (error) {
    logAuthFailure(error, input.env);
    throw new MagicLinkDeliveryError();
  }

  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    logAuthFailure(new Error(`Resend status ${response.status}`), input.env);
    throw new MagicLinkDeliveryError();
  }
}

export function safeAuthLog(message: string, args: unknown[], env: AuthEnv): string {
  const extra = args.map((arg) => {
    if (typeof arg === "string") return arg;
    if (arg instanceof Error) return arg.message;
    return "";
  });
  return redactAuthText([message, ...extra].filter(Boolean).join(" "), authSecretValues(env));
}
