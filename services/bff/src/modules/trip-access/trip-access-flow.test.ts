import { createInMemoryAccessLinkStore } from "./access-link-store.js";
import { createInMemorySessionStore } from "./session-store.js";
import { describeTripAccessFlow } from "./trip-access-flow.conformance.js";

describeTripAccessFlow("in-memory", {
  make: async (now) => ({
    accessLinkStore: createInMemoryAccessLinkStore(now),
    sessionStore: createInMemorySessionStore(now),
  }),
});
