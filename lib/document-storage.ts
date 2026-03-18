import path from "node:path";

export const DOCUMENT_UPLOAD_URL_PREFIX = "/uploads/documents/";

function toSafeFileName(fileName: string) {
  const normalized = fileName.trim();
  if (!normalized) {
    return "";
  }

  if (normalized.includes("/") || normalized.includes("\\") || normalized.includes("\0") || normalized.includes("..")) {
    return "";
  }

  return normalized;
}

export function getUploadStorageDir() {
  return path.join(process.cwd(), "data", "uploads", "documents");
}

export function getLegacyPublicUploadDir() {
  return path.join(process.cwd(), "public", "uploads", "documents");
}

export function buildDocumentPublicPath(fileName: string) {
  return `${DOCUMENT_UPLOAD_URL_PREFIX}${fileName}`;
}

export function isUploadedDocumentSource(source: string | null) {
  return Boolean(source && source.startsWith(DOCUMENT_UPLOAD_URL_PREFIX));
}

export function getFileNameFromDocumentSource(source: string | null) {
  if (!source || !isUploadedDocumentSource(source)) {
    return null;
  }

  const raw = source.slice(DOCUMENT_UPLOAD_URL_PREFIX.length);
  const decoded = decodeURIComponent(raw);
  const safe = toSafeFileName(decoded);
  return safe || null;
}

export function getAbsoluteStoragePathByFileName(fileName: string) {
  const safe = toSafeFileName(fileName);
  if (!safe) {
    return null;
  }
  return path.join(getUploadStorageDir(), safe);
}

export function getAbsoluteStoragePathBySource(source: string | null) {
  const fileName = getFileNameFromDocumentSource(source);
  if (!fileName) {
    return null;
  }
  return getAbsoluteStoragePathByFileName(fileName);
}

export function getCandidateAbsolutePathsByFileName(fileName: string) {
  const safe = toSafeFileName(fileName);
  if (!safe) {
    return [];
  }

  return [
    path.join(getUploadStorageDir(), safe),
    path.join(getLegacyPublicUploadDir(), safe)
  ];
}

