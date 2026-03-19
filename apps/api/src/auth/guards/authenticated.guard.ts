import { CanActivate, ExecutionContext, Inject, Injectable } from "@nestjs/common";
import type { Request } from "express";

import type { AuthPrincipal } from "@lia/shared-types";
import type { RequestContext } from "../../common/observability/request-context.js";
import { parseEnv } from "../../config/env.js";

import { SessionStore } from "../session.store.js";

export interface RequestWithPrincipal extends Request {
  principal?: AuthPrincipal;
  context?: RequestContext;
}

@Injectable()
export class AuthenticatedGuard implements CanActivate {
  private readonly env = parseEnv(process.env);

  constructor(@Inject(SessionStore) private readonly sessionStore: SessionStore) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithPrincipal>();
    const sessionId = request.cookies?.[this.env.SESSION_COOKIE_NAME];
    if (!sessionId) {
      return false;
    }

    request.principal = await this.sessionStore.resolvePrincipal(sessionId);
    return true;
  }
}
