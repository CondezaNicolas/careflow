import type { UserRole } from "../common/constants/user-role.js";
import {
  ASSISTANT_INVOCATION_STATUS,
  ASSISTANT_TOOL_NAME,
  type AssistantToolName,
  type AssistantWriteConfirmation
} from "./assistant.types.js";

export interface AssistantInvokeToolRequest {
  input: unknown;
  confirmation?: AssistantWriteConfirmation;
}

export interface AssistantNewsItem {
  id: string;
  title: string;
  summary: string;
  publishedAtIso: string;
}

export interface AssistantExamStatusResult {
  examId: string;
  available: boolean;
  status: string | null;
  readyAtIso: string | null;
  deliveredAtIso: string | null;
}

export interface AssistantForbiddenResult {
  allowedRoles: UserRole[];
}

export interface AssistantConflictResult {
  reason: string;
}

export const ASSISTANT_CONTRACT_VALUES = {
  TOOL_NAME: ASSISTANT_TOOL_NAME,
  STATUS: ASSISTANT_INVOCATION_STATUS
} as const;

export function isAssistantToolName(value: string): value is AssistantToolName {
  return Object.values(ASSISTANT_TOOL_NAME).includes(value as AssistantToolName);
}
