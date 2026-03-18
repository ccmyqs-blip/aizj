export const DOCUMENT_INGEST_STAGES = [
  "EXTRACTING",
  "CHUNKING",
  "EMBEDDING",
  "COMPLETED",
  "FAILED"
] as const;

export type DocumentIngestStage = (typeof DOCUMENT_INGEST_STAGES)[number];

export const DOCUMENT_INGEST_JOB_STATUSES = [
  "PENDING",
  "RUNNING",
  "COMPLETED",
  "FAILED"
] as const;

export type DocumentIngestJobStatus = (typeof DOCUMENT_INGEST_JOB_STATUSES)[number];

export const DOCUMENT_INGEST_ERROR_CODES = [
  "NO_TEXT",
  "LOW_TEXT_COVERAGE",
  "NO_CHUNK",
  "MISSING_FIELDS",
  "NO_PAGE_NUMBER",
  "OCR_NOT_CONFIGURED",
  "OCR_TIMEOUT",
  "PARSE_ERROR",
  "EMBEDDING_ERROR",
  "UNKNOWN"
] as const;

export type DocumentIngestErrorCode = (typeof DOCUMENT_INGEST_ERROR_CODES)[number];

export class DocumentIngestError extends Error {
  code: DocumentIngestErrorCode;

  constructor(code: DocumentIngestErrorCode, message: string) {
    super(message);
    this.name = "DocumentIngestError";
    this.code = code;
  }
}

