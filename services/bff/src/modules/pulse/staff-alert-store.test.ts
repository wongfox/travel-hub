import { describeStaffAlertStoreContract } from "./staff-alert-store.conformance.js";
import { createInMemoryStaffAlertStore } from "./staff-alert-store.js";

describeStaffAlertStoreContract("in-memory", {
  make: async (now, retention) => createInMemoryStaffAlertStore(now, retention),
});
