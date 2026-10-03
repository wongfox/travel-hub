import { describePulseResponseStoreContract } from "./pulse-response-store.conformance.js";
import { createInMemoryPulseResponseStore } from "./pulse-response-store.js";

describePulseResponseStoreContract("in-memory", {
  make: async (now, retention) => createInMemoryPulseResponseStore(now, retention),
});
