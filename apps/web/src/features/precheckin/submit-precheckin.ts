import type { DocumentType } from "contracts";
import type { ApiClient } from "../../shared/api/client.js";

export interface SubmitPrecheckinInput {
  /** The passenger's ordinal as published on `TripDTO.passengers[]` (the BFF's `:passengerOrdinal`). */
  passengerOrdinal: number;
  docType: DocumentType;
  /** `recordId` of the biometric consent just recorded (`POST /api/consents`). */
  consentRecordId: string;
  photo: Blob;
  idFront: Blob;
}

export interface SubmitPrecheckinResult {
  passengerOrdinal: number;
  status: "received";
}

/**
 * Task 8.3 client: `POST /api/precheckin/:passengerOrdinal` as multipart
 * (`photo`, `id_front`, `docType`, `consentRecordId`). `id_back` is optional
 * server-side and is not collected by this flow. The image blobs only ever
 * live in memory here: nothing is logged, stored or cached.
 */
export async function submitPrecheckin(
  apiClient: ApiClient,
  input: SubmitPrecheckinInput,
): Promise<SubmitPrecheckinResult> {
  const form = new FormData();
  form.append("docType", input.docType);
  form.append("consentRecordId", input.consentRecordId);
  form.append("photo", input.photo, "photo.jpg");
  form.append("id_front", input.idFront, "id_front.jpg");
  return apiClient.post<SubmitPrecheckinResult>(`/api/precheckin/${input.passengerOrdinal}`, form);
}
