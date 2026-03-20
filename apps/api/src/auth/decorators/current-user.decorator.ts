import { createParamDecorator, ExecutionContext } from "@nestjs/common";

import { getRequestPrincipal, type AuthenticatedRequest } from "../auth.types.js";

export const CurrentUser = createParamDecorator(
  (data: keyof import("@lia/shared-types").AuthPrincipal | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    const principal = getRequestPrincipal(request);

    return data ? principal?.[data] : principal;
  }
);
