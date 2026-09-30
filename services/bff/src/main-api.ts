/**
 * Entry point for the `api` process (HTTP). Reads only the minimal
 * environment needed to bind a port at this stage; full env validation
 * (config/env.ts) lands in task 3.2 and this file is updated to consume it
 * in that same commit.
 */
import { buildApp } from "./composition-root.js";

async function main(): Promise<void> {
  const port = Number(process.env.PORT ?? 3000);
  const app = buildApp({ logger: true });

  await app.listen({ port, host: "0.0.0.0" });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
