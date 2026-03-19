import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from "@nestjs/common";
import type { Request, Response } from "express";

import type { ErrorEnvelope } from "../errors/error-envelope.js";

@Catch()
export class HttpExceptionEnvelopeFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const response = context.getResponse<Response>();
    const request = context.getRequest<Request>();
    const requestId = request.headers["x-request-id"] as string;

    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const payload: ErrorEnvelope = {
        requestId,
        code: `HTTP_${statusCode}`,
        message: exception.message,
        statusCode
      };
      response.status(statusCode).json(payload);
      return;
    }

    const payload: ErrorEnvelope = {
      requestId,
      code: "HTTP_500",
      message: "Internal server error",
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR
    };
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json(payload);
  }
}
