/**
 * Real-Postgres test support. DB-backed suites read `TEST_DATABASE_URL`
 * (a throwaway database, e.g. the compose postgres' `travel_hub_test`:
 * `postgres://travel_hub:travel_hub@localhost:5432/travel_hub_test`) and are
 * skipped, with an explicit warning, when it is unset — never silently passed.
 */
export const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

if (!TEST_DATABASE_URL) {
  console.warn(
    "[db tests] TEST_DATABASE_URL is not set: Postgres-backed tests are SKIPPED (not passed). " +
      "Point it at a throwaway database, e.g. postgres://travel_hub:travel_hub@localhost:5432/travel_hub_test",
  );
}
