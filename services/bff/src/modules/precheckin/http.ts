import { PrecheckinSubmissionMetadataSchema, type PrecheckinStatusResponse } from "contracts";
import type { FastifyInstance } from "fastify";
import { DEFAULT_SESSION_COOKIE_NAME } from "../trip-access/http.js";
import { resolveActiveSession, type ResolveSessionDeps } from "../trip-access/session-auth.js";
import { ConsentRequiredError, assertConsentGranted } from "../privacy/consent-guard.js";
import type { ConsentStore } from "../privacy/consent-store.js";
import type { SirBookingPort } from "../booking/ports.js";
import { FLAG_DEFAULTS, type FlagKey } from "../../config/flags.js";
import { resolveScopedPassengerByOrdinal } from "./resolve-scoped-passenger.js";
import { getPrecheckinStatusForPassenger } from "./get-precheckin-status.js";
import { submitPrecheckin, type PrecheckinImageRole } from "./submit-precheckin.js";
import {
  AlreadySubmittedError,
  PassengerNotInScopeError,
  type PrecheckinDocumentStorePort,
  type PrecheckinSubmissionStore,
} from "./ports.js";
import type { KeyManagementPort } from "../../infra/crypto/key-management-port.js";

export interface PrecheckinRouteDeps extends ResolveSessionDeps {
  sirBooking: Pick<SirBookingPort, "getReservation">;
  consentStore: Pick<ConsentStore, "findLatest">;
  submissionStore: Pick<PrecheckinSubmissionStore, "findByPassenger" | "create">;
  documentStore: PrecheckinDocumentStorePort;
  kms: KeyManagementPort;
  /** KMS key identifier for every pre check-in envelope (design Security section). */
  keyId: string;
  /** Server-side flag table; defaults to the compiled-in defaults (task 3.2) when omitted. */
  flags?: Record<FlagKey, boolean>;
  /** Overridable only for tests; production always shares `trip-access`'s `DEFAULT_SESSION_COOKIE_NAME`. */
  sessionCookieName?: string;
}

const KNOWN_IMAGE_ROLES: ReadonlySet<string> = new Set<PrecheckinImageRole>(["photo", "id_front", "id_back"]);

function isKnownImageRole(fieldname: string): fieldname is PrecheckinImageRole {
  return KNOWN_IMAGE_ROLES.has(fieldname);
}

/**
 * Registers `POST /api/precheckin/:passengerOrdinal` (task 8.3) and
 * `GET /api/precheckin/status` (task 8.4). `Cache-Control: no-store` on both
 * is already enforced defense-in-depth by `registerSecurityPlugins`'s
 * `isSensitiveRoute` hook (task 7.2) — this module adds no separate header
 * logic for that.
 */
export function registerPrecheckinRoutes(app: FastifyInstance, deps: PrecheckinRouteDeps): void {
  const cookieName = deps.sessionCookieName ?? DEFAULT_SESSION_COOKIE_NAME;

  app.post<{ Params: { passengerOrdinal: string } }>(
    "/api/precheckin/:passengerOrdinal",
    async (request, reply) => {
      const raw = request.cookies[cookieName];
      const session = await resolveActiveSession(raw, deps);
      if (!session) {
        return reply.code(401).send({ code: "link_expired", requestId: request.id });
      }

      const flags = deps.flags ?? FLAG_DEFAULTS;
      if (!flags["precheckin.production_collection"]) {
        return reply.code(403).send({ code: "feature_disabled", requestId: request.id });
      }

      const ordinal = Number(request.params.passengerOrdinal);
      if (!Number.isInteger(ordinal)) {
        return reply.code(400).send({ code: "invalid_request", requestId: request.id });
      }

      const reservation = await deps.sirBooking.getReservation({ reservationRef: session.accessLink.reservationRef });

      let passenger;
      try {
        passenger = resolveScopedPassengerByOrdinal(reservation.passengers, session.accessLink.passengerScope, ordinal);
      } catch (error) {
        if (error instanceof PassengerNotInScopeError) {
          return reply.code(403).send({ code: "out_of_scope", requestId: request.id });
        }
        throw error;
      }

      try {
        await assertConsentGranted(
          { consentStore: deps.consentStore },
          session.accessLink.reservationRef,
          null,
          "precheckin_biometric",
        );
      } catch (error) {
        if (error instanceof ConsentRequiredError) {
          return reply.code(403).send({ code: "consent_required", requestId: request.id });
        }
        throw error;
      }

      const fields: Record<string, string> = {};
      const images: { role: PrecheckinImageRole; contentType: string; bytes: Buffer }[] = [];
      for await (const part of request.parts()) {
        if (part.type === "file") {
          if (isKnownImageRole(part.fieldname)) {
            images.push({ role: part.fieldname, contentType: part.mimetype, bytes: await part.toBuffer() });
          }
        } else if (typeof part.value === "string") {
          fields[part.fieldname] = part.value;
        }
      }

      const metadataParsed = PrecheckinSubmissionMetadataSchema.safeParse(fields);
      const hasPhoto = images.some((image) => image.role === "photo");
      const hasIdFront = images.some((image) => image.role === "id_front");
      if (!metadataParsed.success || !hasPhoto || !hasIdFront) {
        return reply.code(400).send({ code: "invalid_request", requestId: request.id });
      }

      try {
        await submitPrecheckin(
          {
            reservationRef: session.accessLink.reservationRef,
            passengerRef: passenger.passengerRef,
            docType: metadataParsed.data.docType,
            consentRecordId: metadataParsed.data.consentRecordId,
            images,
          },
          {
            submissionStore: deps.submissionStore,
            documentStore: deps.documentStore,
            kms: deps.kms,
            keyId: deps.keyId,
          },
        );
      } catch (error) {
        if (error instanceof AlreadySubmittedError) {
          return reply.code(409).send({ code: "already_submitted", requestId: request.id });
        }
        throw error;
      }

      return reply.code(201).send({ passengerOrdinal: ordinal, status: "received" });
    },
  );

  app.get("/api/precheckin/status", async (request, reply) => {
    const raw = request.cookies[cookieName];
    const session = await resolveActiveSession(raw, deps);
    if (!session) {
      return reply.code(401).send({ code: "link_expired", requestId: request.id });
    }

    const flags = deps.flags ?? FLAG_DEFAULTS;
    if (!flags["precheckin.capture_ui"]) {
      return reply.code(403).send({ code: "feature_disabled", requestId: request.id });
    }

    const reservation = await deps.sirBooking.getReservation({ reservationRef: session.accessLink.reservationRef });
    const scopedPassengers =
      session.accessLink.passengerScope.length === 0
        ? reservation.passengers
        : reservation.passengers.filter((passenger) =>
            session.accessLink.passengerScope.includes(passenger.passengerRef),
          );

    const statuses: PrecheckinStatusResponse = await Promise.all(
      scopedPassengers.map(async (passenger) => ({
        passengerOrdinal: passenger.ordinal,
        status: await getPrecheckinStatusForPassenger(session.accessLink.reservationRef, passenger.passengerRef, {
          submissionStore: deps.submissionStore,
        }),
      })),
    );

    return reply.code(200).send(statuses);
  });
}
