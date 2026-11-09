import type { VercelConfig } from "@vercel/config/v1";

/**
 * Preview URLs stay off the public web via Vercel Authentication, deployment
 * type "preview" (Pre-Production Deployments). That project setting is not a
 * field on this config. Do not switch it to All Deployments: production stays
 * readable with no sign-in. "preview" protects preview URLs only, including
 * when production is still a vercel.app host with no custom domain.
 */
export const config: VercelConfig = {
  framework: "nextjs",
  buildCommand: "npm test && next build",
};
