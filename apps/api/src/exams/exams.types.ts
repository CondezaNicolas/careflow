export const EXAM_STATUS = {
  PENDING: "pending",
  READY: "ready",
  DELIVERED: "delivered"
} as const;

export type ExamStatus = (typeof EXAM_STATUS)[keyof typeof EXAM_STATUS];

export const EXAM_LIST_VISIBILITY_SCOPE = {
  ALL: "all",
  PATIENT_VISIBLE: "patient_visible"
} as const;

export type ExamListVisibilityScope = (typeof EXAM_LIST_VISIBILITY_SCOPE)[keyof typeof EXAM_LIST_VISIBILITY_SCOPE];

export interface ExamAttachmentMetadata {
  attachmentId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

export interface ExamRecord {
  id: string;
  tenantId: string;
  patientId: string;
  requestedByProfessionalId: string;
  examType: string;
  status: ExamStatus;
  notes: string | null;
  readyAtIso: string | null;
  deliveredAtIso: string | null;
  attachments: ExamAttachmentMetadata[];
  createdAtIso: string;
  updatedAtIso: string;
}
