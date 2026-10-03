import { describeNotificationStoreContract } from "./notification-store.conformance.js";
import { createInMemoryNotificationStore } from "./notification-store.js";

describeNotificationStoreContract("in-memory", {
  make: async (now) => createInMemoryNotificationStore(now),
});
