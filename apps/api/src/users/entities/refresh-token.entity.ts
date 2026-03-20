export interface RefreshToken {
  id: string;
  userId: string;
  tenantId: string;
  tokenHash: string;
  family: string;
  expiresAt: Date;
  createdAt: Date;
  revokedAt: Date | null;
  replacedByTokenId: string | null;
}
