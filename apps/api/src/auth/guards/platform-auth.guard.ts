import { ExecutionContext, Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AuthGuard } from "@nestjs/passport";

import {
  getRequestPrincipal,
  toAuthPrincipal,
  type AuthenticatedRequest,
  type JwtPayload
} from "../auth.types.js";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator.js";

@Injectable()
export class PlatformAuthGuard extends AuthGuard("jwt") {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass()
    ]);

    if (isPublic) {
      return true;
    }

    return super.canActivate(context);
  }

  handleRequest<TUser = JwtPayload>(
    error: Error | null,
    user: TUser | null,
    _info: unknown,
    context: ExecutionContext
  ): TUser {
    if (error != null) {
      throw error;
    }

    if (user == null) {
      throw new UnauthorizedException();
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const principal = toAuthPrincipal(user as unknown as JwtPayload);

    request.principal = principal;
    request.user = principal;
    getRequestPrincipal(request);

    return user;
  }
}
