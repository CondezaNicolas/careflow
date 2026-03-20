import "reflect-metadata";

import { config } from "dotenv";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

// Load .env.local for development
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, "../.env.local"), quiet: true });

import cookieParser from "cookie-parser";
import express, { type Request, type Response, type NextFunction } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import type { INestApplication } from "@nestjs/common";
import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";

import { AppModule } from "./app.module.js";
import { HttpExceptionEnvelopeFilter } from "./common/filters/http-exception.filter.js";
import { createRateLimitErrorEnvelope } from "./common/errors/error-envelope.js";
import { requestIdMiddleware } from "./common/middleware/request-id.middleware.js";
import { requestLoggingMiddleware } from "./common/middleware/request-logging.middleware.js";
import { getLogger, normalizeError } from "./common/observability/platform-logger.js";
import {
  REQUEST_CONTEXT_HEADER,
  type RequestWithContext
} from "./common/observability/request-context.js";
import { InvalidEnvironmentError } from "./config/env.js";
import { PlatformConfigService } from "./config/platform-config.service.js";
import {
  buildAuthRouteRateLimitPolicies,
  createRateLimitMessage,
  isAuthRateLimitedPath
} from "./config/rate-limit-policy.js";
import { createValidationPipeOptions } from "./common/validation/api-validation.js";

async function bootstrap() {
  const logger = getLogger({ component: "Bootstrap" });

  try {
    logger.info({ event: "application.starting" });

    const app = await NestFactory.create(AppModule, { bufferLogs: true });
    const platformConfig = app.get(PlatformConfigService);

    app.enableShutdownHooks();
    registerGracefulShutdown(app, platformConfig.server.shutdownGracePeriodMs);

    // ---- Security Middleware ----

    app.enableCors({
      origin: platformConfig.server.allowedOrigins,
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Cookie", "Set-Cookie", "x-correlation-id"]
    });

    // Security headers (Helmet)
    app.use(
      helmet({
        contentSecurityPolicy: false,
        crossOriginEmbedderPolicy: false
      })
    );

    const authRoutePolicies = buildAuthRouteRateLimitPolicies(platformConfig.rateLimit);
    for (const policy of authRoutePolicies) {
      app.use(
        policy.path,
        rateLimit({
          windowMs: platformConfig.rateLimit.windowMs,
          max: policy.maxRequests,
          standardHeaders: true,
          legacyHeaders: false,
          handler: (request, response) => {
            response
              .status(429)
              .json(
                createRateLimitErrorEnvelope(
                  resolveRequestId(request),
                  createRateLimitMessage(policy.route)
                )
              );
          }
        })
      );
    }

    const limiter = rateLimit({
      windowMs: platformConfig.rateLimit.windowMs,
      max: platformConfig.rateLimit.maxRequests,
      standardHeaders: true,
      legacyHeaders: false,
      skip: (request) => isAuthRateLimitedPath(request.path),
      handler: (request, response) => {
        response
          .status(429)
          .json(createRateLimitErrorEnvelope(resolveRequestId(request), "Too many requests"));
      }
    });
    app.use(limiter);

    // Body size limit (built into express)
    app.use(express.json({ limit: "1mb" }));

    // Request timeout
    app.use((req: Request, res: Response, next: NextFunction) => {
      req.setTimeout(platformConfig.server.requestTimeoutMs);
      res.setTimeout(platformConfig.server.requestTimeoutMs);
      next();
    });

    // Cookie parser
    app.use(cookieParser(platformConfig.cookies.sessionSecret));

    // Request ID middleware
    app.use(requestIdMiddleware);

    // Request logging middleware (with Pino)
    if (platformConfig.server.requestLoggingEnabled) {
      app.use(requestLoggingMiddleware);
    }

    // Global exception filter with requestId
    app.useGlobalFilters(new HttpExceptionEnvelopeFilter());

    // Global validation pipe for DTOs
    app.useGlobalPipes(
      new ValidationPipe({
        ...createValidationPipeOptions()
      })
    );

    await app.listen(platformConfig.server.apiPort);

    logger.info({
      event: "application.started",
      apiPort: platformConfig.server.apiPort,
      requestLoggingEnabled: platformConfig.server.requestLoggingEnabled,
      runtimeMode: platformConfig.runtime.mode,
      shutdownGracePeriodMs: platformConfig.server.shutdownGracePeriodMs
    });
  } catch (error) {
    if (error instanceof InvalidEnvironmentError) {
      logger.error({
        event: "application.startup.invalid_environment",
        issues: error.issues
      });
      for (const issue of error.issues) {
        logger.error({
          event: "application.startup.invalid_environment_issue",
          key: issue.key,
          message: issue.message
        });
      }
      process.exit(1);
    }

    logger.error({
      event: "application.startup.failed",
      error: normalizeError(error)
    });

    throw error;
  }
}

function registerGracefulShutdown(app: INestApplication, gracePeriodMs: number): void {
  let shutdownPromise: Promise<void> | null = null;

  const handleSignal = (signal: NodeJS.Signals) => {
    shutdownPromise ??= executeGracefulShutdown(app, signal, gracePeriodMs);
  };

  process.once("SIGTERM", handleSignal);
  process.once("SIGINT", handleSignal);
}

async function executeGracefulShutdown(
  app: INestApplication,
  signal: NodeJS.Signals,
  gracePeriodMs: number
): Promise<void> {
  const logger = getLogger({ component: "Bootstrap" });

  logger.info({
    event: "application.shutdown.requested",
    signal,
    gracePeriodMs
  });

  const timeout = setTimeout(() => {
    logger.error({
      event: "application.shutdown.timed_out",
      signal,
      gracePeriodMs
    });
    process.exit(1);
  }, gracePeriodMs);

  timeout.unref();

  try {
    await app.close();
    clearTimeout(timeout);

    logger.info({
      event: "application.shutdown.completed",
      signal
    });
    process.exit(0);
  } catch (error) {
    clearTimeout(timeout);

    logger.error({
      event: "application.shutdown.failed",
      signal,
      error: normalizeError(error)
    });
    process.exit(1);
  }
}

function resolveRequestId(request: Request): string | null {
  const requestContext = (request as RequestWithContext).context;

  return (
    requestContext?.requestId ??
    (request.headers[REQUEST_CONTEXT_HEADER.REQUEST_ID] as string | undefined) ??
    null
  );
}

void bootstrap();
