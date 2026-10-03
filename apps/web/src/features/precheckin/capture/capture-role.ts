/**
 * Which document this capture step is for (design Decision 15: front camera
 * for the passenger's own photo, rear camera for an ID document). Kept as
 * its own module so every capture-related file shares one definition instead
 * of a repeated inline union.
 */
export type PrecheckinCaptureRole = "photo" | "id_front" | "id_back";
