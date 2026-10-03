import { describeWifiOrderStoreContract } from "./wifi-order-store.conformance.js";
import { createInMemoryWifiOrderStore } from "./wifi-order-store.js";

describeWifiOrderStoreContract("in-memory", {
  make: async (now) => createInMemoryWifiOrderStore(now),
});
