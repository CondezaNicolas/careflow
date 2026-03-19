import "reflect-metadata";

import cookieParser from "cookie-parser";
import { NestFactory } from "@nestjs/core";

import { AppModule } from "./app.module.js";
import { HttpExceptionEnvelopeFilter } from "./common/filters/http-exception.filter.js";
import { requestIdMiddleware } from "./common/middleware/request-id.middleware.js";
import { requestLoggingMiddleware } from "./common/middleware/request-logging.middleware.js";
import { parseEnv } from "./config/env.js";

async function bootstrap() {
  const env = parseEnv(process.env);
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  
  // Enable CORS for frontend
  app.enableCors({
    origin: ["http://localhost:3310", "http://localhost:3000"],
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Cookie", "Set-Cookie", "x-correlation-id"]
  });
  
  app.use(cookieParser());
  app.use(requestIdMiddleware);
  if (env.ENABLE_REQUEST_LOGGING) {
    app.use(requestLoggingMiddleware);
  }
  app.useGlobalFilters(new HttpExceptionEnvelopeFilter());
  await app.listen(env.API_PORT);
}

void bootstrap();
