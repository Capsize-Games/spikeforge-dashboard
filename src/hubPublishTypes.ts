/** Client-side state and payload shapes for publishing a model to the hub. */

/** Stages of one publish attempt, in order. */
export type PublishStatus =
  | "idle"
  | "hashing"
  | "reserving"
  | "uploading"
  | "committing"
  | "done"
  | "cancelled"
  | "error";

/** The publish form's fields, already trimmed. */
export interface PublishFormValues {
  name: string;
  version: string;
  license: string;
  summary: string;
}

/** An RFC 9457 problem document, as `hub_api.errors.HubError` renders it. */
export interface ProblemDetail {
  type: string;
  title: string;
  status: number;
  detail: string;
  instance: string;
  [key: string]: unknown;
}

/** Where a publish attempt failed, so the UI can explain it precisely. */
export type PublishError =
  | { kind: "local"; message: string }
  | { kind: "auth"; message: string }
  | { kind: "network"; message: string }
  | { kind: "hub"; problem: ProblemDetail };
