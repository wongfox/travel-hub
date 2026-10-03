import { describeConsentStoreContract } from "./consent-store.conformance.js";
import { createInMemoryConsentStore } from "./consent-store.js";

describeConsentStoreContract("in-memory", {
  make: async () => createInMemoryConsentStore(),
});
