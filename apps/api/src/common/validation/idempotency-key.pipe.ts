import { ArgumentMetadata, Injectable, PipeTransform } from "@nestjs/common";

import { createValidationException } from "./api-validation.js";

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]+$/;

@Injectable()
export class IdempotencyKeyPipe implements PipeTransform<string | undefined, string> {
  transform(value: string | undefined, _metadata: ArgumentMetadata): string {
    const normalized = value?.trim();

    if (!normalized) {
      throw createValidationException([
        createConstraintError("idempotency-key", "idempotency-key header is required")
      ]);
    }

    if (normalized.length > 128) {
      throw createValidationException([
        createConstraintError("idempotency-key", "idempotency-key header exceeds 128 characters")
      ]);
    }

    if (!IDEMPOTENCY_KEY_PATTERN.test(normalized)) {
      throw createValidationException([
        createConstraintError(
          "idempotency-key",
          "idempotency-key header contains invalid characters"
        )
      ]);
    }

    return normalized;
  }
}

function createConstraintError(property: string, message: string) {
  return {
    property,
    constraints: {
      validation: message
    },
    children: []
  };
}
