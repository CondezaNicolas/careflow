import type {
  ExamAttachmentMetadata,
  ExamListVisibilityScope,
  ExamRecord,
  ExamStatus
} from "./exams.types.js";
import { EXAM_LIST_VISIBILITY_SCOPE, EXAM_STATUS } from "./exams.types.js";

export interface CreateExamRequest {
  patientId: string;
  examType: string;
  notes: string | null;
  attachments: ExamAttachmentMetadata[];
}

export interface UpdateExamRequest {
  examType: string;
  notes: string | null;
  attachments: ExamAttachmentMetadata[];
}

export interface TransitionExamStatusRequest {
  toStatus: ExamStatus;
}

export interface ListPatientExamsQuery {
  visibilityScope: ExamListVisibilityScope;
}

export interface ExamResponse {
  exam: ExamRecord;
}

export interface ExamsListResponse {
  patientId: string;
  visibilityScope: ExamListVisibilityScope;
  exams: ExamRecord[];
}

export const EXAM_CONTRACT_VALUES = {
  STATUS: EXAM_STATUS,
  LIST_VISIBILITY_SCOPE: EXAM_LIST_VISIBILITY_SCOPE
} as const;
