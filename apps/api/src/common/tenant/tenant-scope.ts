import { ForbiddenException } from "@nestjs/common";

import type { AuthPrincipal } from "@lia/shared-types";

const TENANT_SCOPE_BRAND = Symbol("tenant-scope");

export interface TenantScope {
  tenantId: string;
  [TENANT_SCOPE_BRAND]: true;
}

export function tenantScopeFromPrincipal(principal: AuthPrincipal): TenantScope {
  return {
    tenantId: principal.tenantId,
    [TENANT_SCOPE_BRAND]: true
  };
}

export function assertTenantScope(principal: AuthPrincipal, tenantId: string): TenantScope {
  if (principal.tenantId !== tenantId) {
    throw new ForbiddenException("Cross-tenant access denied");
  }

  return tenantScopeFromPrincipal(principal);
}
