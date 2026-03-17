-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "source" TEXT,
    "version" TEXT NOT NULL DEFAULT 'v1',
    "publishDate" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "DocumentChunk" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "documentId" TEXT NOT NULL,
    "chapterTitle" TEXT,
    "sectionTitle" TEXT,
    "chunkText" TEXT NOT NULL,
    "pageNumber" INTEGER,
    "keywords" TEXT,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DocumentChunk_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QARecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "sourceChunkIds" TEXT,
    "modelName" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,
    "userAgent" TEXT
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "companyName" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "wechat" TEXT,
    "email" TEXT,
    "demand" TEXT,
    "sourcePage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "note" TEXT
);

-- CreateTable
CREATE TABLE "AdminConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "configKey" TEXT NOT NULL,
    "configValue" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "Document_title_idx" ON "Document"("title");

-- CreateIndex
CREATE INDEX "Document_category_idx" ON "Document"("category");

-- CreateIndex
CREATE INDEX "Document_status_idx" ON "Document"("status");

-- CreateIndex
CREATE INDEX "Document_publishDate_idx" ON "Document"("publishDate");

-- CreateIndex
CREATE UNIQUE INDEX "Document_code_version_key" ON "Document"("code", "version");

-- CreateIndex
CREATE INDEX "DocumentChunk_documentId_sortOrder_idx" ON "DocumentChunk"("documentId", "sortOrder");

-- CreateIndex
CREATE INDEX "DocumentChunk_chapterTitle_idx" ON "DocumentChunk"("chapterTitle");

-- CreateIndex
CREATE INDEX "DocumentChunk_sectionTitle_idx" ON "DocumentChunk"("sectionTitle");

-- CreateIndex
CREATE INDEX "DocumentChunk_pageNumber_idx" ON "DocumentChunk"("pageNumber");

-- CreateIndex
CREATE INDEX "QARecord_createdAt_idx" ON "QARecord"("createdAt");

-- CreateIndex
CREATE INDEX "QARecord_modelName_idx" ON "QARecord"("modelName");

-- CreateIndex
CREATE INDEX "Lead_phone_idx" ON "Lead"("phone");

-- CreateIndex
CREATE INDEX "Lead_status_idx" ON "Lead"("status");

-- CreateIndex
CREATE INDEX "Lead_createdAt_idx" ON "Lead"("createdAt");

-- CreateIndex
CREATE INDEX "Lead_companyName_idx" ON "Lead"("companyName");

-- CreateIndex
CREATE UNIQUE INDEX "AdminConfig_configKey_key" ON "AdminConfig"("configKey");
