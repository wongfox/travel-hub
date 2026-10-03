import { describePushSubscriptionStoreContract } from "./push-subscription-store.conformance.js";
import { createInMemoryPushSubscriptionStore } from "./push-subscription-store.js";

describePushSubscriptionStoreContract("in-memory", {
  make: async (now) => createInMemoryPushSubscriptionStore(now),
});
