import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { BadRequestException, UnauthorizedException } from "@nestjs/common";

import { API_ERROR_CODE } from "../errors/error-envelope.js";
import { HttpExceptionEnvelopeFilter } from "./http-exception.filter.js";

describe("HttpExceptionEnvelopeFilter", () => {
  it("preserves structured validation details in the response envelope", () => {
    const filter = new HttpExceptionEnvelopeFilter();
    const response = createResponse();

    filter.catch(
      new BadRequestException({
        code: API_ERROR_CODE.VALIDATION_ERROR,
        message: "Request validation failed",
        details: [
          { field: "role", message: "role must be one of admin, clinician, receptionist, patient" }
        ]
      }),
      createHost(response)
    );

    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.body, {
      requestId: "req-123",
      code: API_ERROR_CODE.VALIDATION_ERROR,
      message: "Request validation failed",
      statusCode: 400,
      details: [
        { field: "role", message: "role must be one of admin, clinician, receptionist, patient" }
      ]
    });
  });

  it("maps auth failures into the shared error code contract", () => {
    const filter = new HttpExceptionEnvelopeFilter();
    const response = createResponse();

    filter.catch(new UnauthorizedException("Invalid credentials"), createHost(response));

    assert.equal(response.statusCode, 401);
    assert.deepEqual(response.body, {
      requestId: "req-123",
      code: API_ERROR_CODE.AUTH_UNAUTHORIZED,
      message: "Invalid credentials",
      statusCode: 401
    });
  });
});

function createHost(response: ReturnType<typeof createResponse>) {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        headers: {},
        context: { requestId: "req-123", traceId: "trace-123" },
        header: () => undefined
      }),
      getResponse: () => response
    })
  } as unknown as import("@nestjs/common").ArgumentsHost;
}

function createResponse() {
  return {
    body: null as unknown,
    statusCode: 200,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    }
  };
}
