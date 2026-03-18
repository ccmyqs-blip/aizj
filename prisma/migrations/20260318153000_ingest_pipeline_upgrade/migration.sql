-- Compatibility tables for environments that were initialized via db push
CREATE TABLE IF NOT EXISTS "DocumentChunkEmbedding" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "chunkId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "vector" TEXT NOT NULL,
    "dimensions" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DocumentChunkEmbedding_chunkId_fkey" FOREIGN KEY ("chunkId") REFERENCES "DocumentChunk" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS "UserSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    CONSTRAINT "UserSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "QAConversation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "QAConversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "Feedback" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "feedbackType" TEXT NOT NULL DEFAULT 'GENERAL',
    "sourcePage" TEXT,
    "content" TEXT NOT NULL,
    "contact" TEXT,
    "rating" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "note" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "DocumentChunkEmbedding_chunkId_model_key" ON "DocumentChunkEmbedding"("chunkId", "model");
CREATE INDEX IF NOT EXISTS "DocumentChunkEmbedding_model_idx" ON "DocumentChunkEmbedding"("model");
CREATE INDEX IF NOT EXISTS "DocumentChunkEmbedding_chunkId_idx" ON "DocumentChunkEmbedding"("chunkId");
CREATE UNIQUE INDEX IF NOT EXISTS "User_username_key" ON "User"("username");
CREATE UNIQUE INDEX IF NOT EXISTS "UserSession_tokenHash_key" ON "UserSession"("tokenHash");
CREATE INDEX IF NOT EXISTS "UserSession_userId_idx" ON "UserSession"("userId");
CREATE INDEX IF NOT EXISTS "UserSession_expiresAt_idx" ON "UserSession"("expiresAt");
CREATE INDEX IF NOT EXISTS "QAConversation_userId_updatedAt_idx" ON "QAConversation"("userId", "updatedAt");
CREATE INDEX IF NOT EXISTS "Feedback_createdAt_idx" ON "Feedback"("createdAt");
CREATE INDEX IF NOT EXISTS "Feedback_status_idx" ON "Feedback"("status");
CREATE INDEX IF NOT EXISTS "Feedback_sourcePage_idx" ON "Feedback"("sourcePage");
CREATE INDEX IF NOT EXISTS "Feedback_feedbackType_idx" ON "Feedback"("feedbackType");

-- CreateTable
CREATE TABLE "DocumentIngestJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "documentId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "filePath" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "startedAt" DATETIME,
    "finishedAt" DATETIME,
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DocumentIngestJob_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Document" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "source" TEXT,
    "version" TEXT NOT NULL DEFAULT 'v1',
    "publishDate" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "ingestError" TEXT,
    "ingestStage" TEXT NOT NULL DEFAULT 'COMPLETED',
    "textCoverage" REAL NOT NULL DEFAULT 0,
    "pageCount" INTEGER NOT NULL DEFAULT 0,
    "parsedPageCount" INTEGER NOT NULL DEFAULT 0,
    "ocrUsed" BOOLEAN NOT NULL DEFAULT false,
    "lastIngestAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Document" ("category", "code", "createdAt", "id", "publishDate", "source", "status", "title", "updatedAt", "version") SELECT "category", "code", "createdAt", "id", "publishDate", "source", "status", "title", "updatedAt", "version" FROM "Document";
DROP TABLE "Document";
ALTER TABLE "new_Document" RENAME TO "Document";
CREATE INDEX "Document_title_idx" ON "Document"("title");
CREATE INDEX "Document_category_idx" ON "Document"("category");
CREATE INDEX "Document_status_idx" ON "Document"("status");
CREATE INDEX "Document_publishDate_idx" ON "Document"("publishDate");
CREATE INDEX "Document_ingestStage_status_idx" ON "Document"("ingestStage", "status");
CREATE INDEX "Document_lastIngestAt_idx" ON "Document"("lastIngestAt");
CREATE UNIQUE INDEX "Document_code_version_key" ON "Document"("code", "version");
CREATE TABLE "new_QARecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "conversationId" TEXT,
    "turnIndex" INTEGER,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "sourceChunkIds" TEXT,
    "modelName" TEXT,
    "retrievalQuery" TEXT,
    "retrievedChunkCount" INTEGER NOT NULL DEFAULT 0,
    "topChunkIds" TEXT,
    "topChunkScores" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,
    "userAgent" TEXT,
    CONSTRAINT "QARecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "QARecord_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "QAConversation" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_QARecord" ("answer", "createdAt", "id", "ip", "modelName", "question", "sourceChunkIds", "userAgent")
SELECT "answer", "createdAt", "id", "ip", "modelName", "question", "sourceChunkIds", "userAgent" FROM "QARecord";
DROP TABLE "QARecord";
ALTER TABLE "new_QARecord" RENAME TO "QARecord";
CREATE INDEX "QARecord_createdAt_idx" ON "QARecord"("createdAt");
CREATE INDEX "QARecord_modelName_idx" ON "QARecord"("modelName");
CREATE INDEX "QARecord_userId_createdAt_idx" ON "QARecord"("userId", "createdAt");
CREATE INDEX "QARecord_conversationId_createdAt_idx" ON "QARecord"("conversationId", "createdAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "DocumentIngestJob_status_createdAt_idx" ON "DocumentIngestJob"("status", "createdAt");

-- CreateIndex
CREATE INDEX "DocumentIngestJob_documentId_createdAt_idx" ON "DocumentIngestJob"("documentId", "createdAt");
