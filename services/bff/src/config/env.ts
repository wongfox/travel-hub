import { z } from "zod";

/**
 * Environments the BFF can run in. `staging` and `production` are treated
 * as "production-like" for go-live guard purposes (see go-live-guards.ts).
 */
export const NodeEnvSchema = z.enum(["development", "test", "staging", "production"]);
export type NodeEnvName = z.infer<typeof NodeEnvSchema>;

const EnvSchema = z.object({
  NODE_ENV: NodeEnvSchema.default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
});

export type Env = z.infer<typeof EnvSchema>;

/**
 * Parses and validates process environment variables required to boot the
 * BFF. Throws with a descriptive message when required variables are
 * missing or malformed, so misconfiguration fails fast at startup rather
 * than producing confusing runtime errors later.
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const result = EnvSchema.safeParse(source);
  if (!result.success) {
    throw new Error(`Invalid environment configuration: ${result.error.message}`);
  }
  return result.data;
}
