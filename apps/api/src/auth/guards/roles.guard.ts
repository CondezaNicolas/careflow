import { CanActivate, ExecutionContext, Inject, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import type { UserRole } from "../../common/constants/user-role.js";
import { ROLES_KEY } from "../decorators/roles.decorator.js";
import type { RequestWithPrincipal } from "./authenticated.guard.js";

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const allowedRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass()
    ]);
    if (!allowedRoles || allowedRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithPrincipal>();
    return Boolean(request.principal && allowedRoles.includes(request.principal.role));
  }
}
