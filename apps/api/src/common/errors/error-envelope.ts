import { HttpStatus } from "@nestjs/common";

export const API_ERROR_CODE = {
  VALIDATION_ERROR: "VALIDATION_ERROR",
  AUTH_UNAUTHORIZED: "AUTH_UNAUTHORIZED",
  AUTH_FORBIDDEN: "AUTH_FORBIDDEN",
  RATE_LIMITED: "RATE_LIMITED",
  RESOURCE_NOT_FOUND: "RESOURCE_NOT_FOUND",
  DOMAIN_CONFLICT: "DOMAIN_CONFLICT",
  REQUEST_INVALID: "REQUEST_INVALID",
  INTERNAL_SERVER_ERROR: "INTERNAL_SERVER_ERROR"
} as const;

export type ApiErrorCode = (typeof API_ERROR_CODE)[keyof typeof API_ERROR_CODE];

export interface ErrorEnvelopeDetail {
  field?: string;
  message: string;
}

export interface ErrorEnvelope {
  requestId: string | null;
  code: string;
  message: string;
  statusCode: number;
  details?: ErrorEnvelopeDetail[];
}

export interface ErrorEnvelopeInput {
  code?: string;
  details?: ErrorEnvelopeDetail[];
  message: string;
  requestId: string | null;
  statusCode: number;
}

export function createErrorEnvelope(input: ErrorEnvelopeInput): ErrorEnvelope {
  const payload: ErrorEnvelope = {
    requestId: input.requestId,
    code: input.code ?? mapStatusCodeToErrorCode(input.statusCode),
    message: input.message,
    statusCode: input.statusCode
  };

  if (input.details != null && input.details.length > 0) {
    payload.details = input.details;
  }

  return payload;
}

export function createRateLimitErrorEnvelope(
  requestId: string | null,
  message = "Too many requests"
): ErrorEnvelope {
  return createErrorEnvelope({
    requestId,
    statusCode: HttpStatus.TOO_MANY_REQUESTS,
    code: API_ERROR_CODE.RATE_LIMITED,
    message
  });
}

export function mapStatusCodeToErrorCode(statusCode: number): ApiErrorCode {
  if (statusCode === HttpStatus.BAD_REQUEST) {
    return API_ERROR_CODE.REQUEST_INVALID;
  }

  if (statusCode === HttpStatus.UNAUTHORIZED) {
    return API_ERROR_CODE.AUTH_UNAUTHORIZED;
  }

  if (statusCode === HttpStatus.FORBIDDEN) {
    return API_ERROR_CODE.AUTH_FORBIDDEN;
  }

  if (statusCode === HttpStatus.NOT_FOUND) {
    return API_ERROR_CODE.RESOURCE_NOT_FOUND;
  }

  if (statusCode === HttpStatus.CONFLICT) {
    return API_ERROR_CODE.DOMAIN_CONFLICT;
  }

  if (statusCode === HttpStatus.TOO_MANY_REQUESTS) {
    return API_ERROR_CODE.RATE_LIMITED;
  }

  return API_ERROR_CODE.INTERNAL_SERVER_ERROR;
}
