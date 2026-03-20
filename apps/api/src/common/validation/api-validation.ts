import { BadRequestException, ValidationPipeOptions } from "@nestjs/common";
import type { ValidationError } from "class-validator";

import {
  API_ERROR_CODE,
  createErrorEnvelope,
  type ErrorEnvelope,
  type ErrorEnvelopeDetail
} from "../errors/error-envelope.js";

export function createValidationException(errors: ValidationError[]): BadRequestException {
  const details = flattenValidationErrors(errors);
  const payload: ErrorEnvelope = createErrorEnvelope({
    requestId: null,
    statusCode: 400,
    code: API_ERROR_CODE.VALIDATION_ERROR,
    message: "Request validation failed",
    details
  });

  return new BadRequestException(payload);
}

export function createValidationPipeOptions(): ValidationPipeOptions {
  return {
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: {
      enableImplicitConversion: true,
      exposeDefaultValues: true
    },
    exceptionFactory: createValidationException
  };
}

export function flattenValidationErrors(
  errors: ValidationError[],
  parentPath?: string
): ErrorEnvelopeDetail[] {
  return errors.flatMap((error) => {
    const field =
      parentPath == null || parentPath.length === 0
        ? error.property
        : `${parentPath}.${error.property}`;
    const constraints = Object.values(error.constraints ?? {}).map((message) => ({
      field,
      message
    }));
    const children = flattenValidationErrors(error.children ?? [], field);

    return [...constraints, ...children];
  });
}
