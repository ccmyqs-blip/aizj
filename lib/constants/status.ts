export const DOCUMENT_STATUSES = ["ACTIVE", "PROCESSING", "FAILED", "ARCHIVED", "DRAFT"] as const;
export type DocumentStatusValue = (typeof DOCUMENT_STATUSES)[number];

export const LEAD_STATUSES = ["NEW", "CONTACTED", "IN_PROGRESS", "CONVERTED", "INVALID"] as const;
export type LeadStatusValue = (typeof LEAD_STATUSES)[number];

export const FEEDBACK_TYPES = ["GENERAL", "BUG", "SUGGESTION", "DATA_ERROR", "OTHER"] as const;
export type FeedbackTypeValue = (typeof FEEDBACK_TYPES)[number];

export const FEEDBACK_STATUSES = ["NEW", "REVIEWED", "RESOLVED", "REJECTED"] as const;
export type FeedbackStatusValue = (typeof FEEDBACK_STATUSES)[number];
