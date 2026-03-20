import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ValidationPipe, type ArgumentMetadata, type Type } from "@nestjs/common";

import { DevLoginQueryDto } from "../../auth/dtos/dev-login-query.dto.js";
import { SearchAvailabilityQueryDto } from "../../scheduling/scheduling.dtos.js";
import { API_ERROR_CODE } from "../errors/error-envelope.js";
import { createValidationPipeOptions } from "./api-validation.js";
import { IdempotencyKeyPipe } from "./idempotency-key.pipe.js";

describe("api validation conventions", () => {
  it("normalizes dev-login query defaults through the shared validation pipe", async () => {
    const validationPipe = new ValidationPipe(createValidationPipeOptions());

    const result = await validationPipe.transform(
      {
        redirect: "  /ops  "
      },
      metadataFor(DevLoginQueryDto, "query")
    );

    assert.equal(result.role, "admin");
    assert.equal(result.redirect, "/ops");
  });

  it("converts scheduling availability query strings into a validated DTO contract", async () => {
    const validationPipe = new ValidationPipe(createValidationPipeOptions());

    const result = await validationPipe.transform(
      {
        specialistId: " usr-1 ",
        from: "2026-04-01T09:00:00Z",
        to: "2026-04-01T10:00:00Z",
        durationMinutes: "45"
      },
      metadataFor(SearchAvailabilityQueryDto, "query")
    );

    assert.equal(result.specialistId, "usr-1");
    assert.equal(result.durationMinutes, 45);
  });

  it("rejects invalid idempotency keys with the shared validation envelope", () => {
    const pipe = new IdempotencyKeyPipe();

    assert.throws(
      () => pipe.transform(" bad key ", metadataFor(String, "custom", "idempotency-key")),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        const response = (error as unknown as { getResponse: () => unknown }).getResponse() as {
          code: string;
          details: Array<{ field?: string; message: string }>;
          message: string;
          statusCode: number;
        };

        assert.equal(response.code, API_ERROR_CODE.VALIDATION_ERROR);
        assert.equal(response.message, "Request validation failed");
        assert.equal(response.statusCode, 400);
        assert.deepEqual(response.details, [
          {
            field: "idempotency-key",
            message: "idempotency-key header contains invalid characters"
          }
        ]);

        return true;
      }
    );
  });
});

function metadataFor(
  metatype: Type<unknown>,
  type: "body" | "query" | "param" | "custom",
  data?: string
) {
  return {
    metatype,
    type,
    data
  } as ArgumentMetadata;
}
