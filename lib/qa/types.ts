export type RetrievedChunk = {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  documentCode: string;
  chapterTitle: string | null;
  sectionTitle: string | null;
  pageNumber: number | null;
  chunkText: string;
  score: number;
};

export type QACitation = {
  chunkId: string;
  documentTitle: string;
  documentCode: string;
  chapterTitle: string | null;
  sectionTitle: string | null;
  pageNumber: number | null;
  excerpt: string;
};

export type QAResponsePayload = {
  answer: string;
  citations: QACitation[];
  modelName: string;
};
