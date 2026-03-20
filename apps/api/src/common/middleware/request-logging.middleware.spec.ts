import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { describe, it } from "node:test";

import type { NextFunction, Request, Response } from "express";

import { requestContextStorage } from "../observability/request-context.js";
import { requestLoggingMiddleware } from "./request-logging.middleware.js";

describe("requestLoggingMiddleware", () => {
  it("propagates request context through downstream async work", async () => {
    const request = {
      method: "GET",
      originalUrl: "/health/ready",
      header(name: string) {
        if (name === "x-request-id") {
          return "req-123";
        }

        if (name === "x-trace-id") {
          return "trace-123";
        }

        return undefined;
      },
      context: {
        requestId: "req-123",
        traceId: "trace-123"
      }
    } as unknown as Request;

    const response = new EventEmitter() as Response & EventEmitter;
    response.statusCode = 200;

    const observedRequestIds: string[] = [];

    await new Promise<void>((resolve, reject) => {
      const next: NextFunction = () => {
        setImmediate(() => {
          try {
            observedRequestIds.push(requestContextStorage.getStore()?.requestId ?? "missing");
            response.emit("finish");
            resolve();
          } catch (error) {
            reject(error);
          }
        });
      };

      requestLoggingMiddleware(request, response, next);
    });

    assert.deepEqual(observedRequestIds, ["req-123"]);
  });
});
