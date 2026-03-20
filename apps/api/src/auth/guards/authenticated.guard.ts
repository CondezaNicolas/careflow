import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";

import { getRequestPrincipal, type AuthenticatedRequest } from "../auth.types.js";

export type RequestWithPrincipal = AuthenticatedRequest;

@Injectable()
export class AuthenticatedGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    return getRequestPrincipal(request) != null;
  }
}
