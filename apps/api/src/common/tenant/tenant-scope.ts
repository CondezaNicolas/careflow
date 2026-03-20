import { ForbiddenException } from "@nestjs/common";

import type { AuthPrincipal } from "@lia/shared-types";

const TENANT_SCOPE_BRAND = Symbol("tenant-scope");

export interface TenantScope {
  tenantId: string;
  [TENANT_SCOPE_BRAND]: true;
}

export interface TenantScopeInput {
  tenantId: string;
}

export function tenantScopeFromTenantId(tenantId: string): TenantScope {
  return {
    tenantId,
    [TENANT_SCOPE_BRAND]: true
  };
}

export function tenantScopeFromPrincipal(principal: AuthPrincipal): TenantScope {
  return tenantScopeFromTenantId(principal.tenantId);
}

export function tenantIdFromScope(scope: TenantScopeInput): string {
  return scope.tenantId;
}

export function assertTenantScope(
  principal: AuthPrincipal,
  tenant: TenantScopeInput | string
): TenantScope {
  const tenantId = typeof tenant === "string" ? tenant : tenantIdFromScope(tenant);
  if (principal.tenantId !== tenantId) {
    throw new ForbiddenException("Cross-tenant access denied");
  }

  return tenantScopeFromPrincipal(principal);
}
