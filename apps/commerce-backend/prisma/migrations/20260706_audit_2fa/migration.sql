-- Sprint 12.3: Audit log tablosu + 2FA (TOTP) tablosu

-- AuditLog
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID,
    "userId" UUID,
    "customerId" UUID,
    "action" VARCHAR(80) NOT NULL,
    "severity" VARCHAR(20) NOT NULL DEFAULT 'info',
    "ip" VARCHAR(64),
    "userAgent" VARCHAR(512),
    "correlationId" VARCHAR(64),
    "path" VARCHAR(512),
    "method" VARCHAR(16),
    "context" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "audit_logs_tenantId_occurredAt_idx" ON "audit_logs"("tenantId", "occurredAt");
CREATE INDEX "audit_logs_userId_occurredAt_idx" ON "audit_logs"("userId", "occurredAt");
CREATE INDEX "audit_logs_action_occurredAt_idx" ON "audit_logs"("action", "occurredAt");
CREATE INDEX "audit_logs_severity_occurredAt_idx" ON "audit_logs"("severity", "occurredAt");
CREATE INDEX "audit_logs_correlationId_idx" ON "audit_logs"("correlationId");

-- UserTwoFactor (TOTP)
CREATE TABLE "user_two_factors" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "secret" VARCHAR(128),
    "lastUsedCode" VARCHAR(10),
    "lastUsedAt" TIMESTAMP(3),
    "backupCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "enabledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_two_factors_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_two_factors_tenantId_userId_key" ON "user_two_factors"("tenantId", "userId");
CREATE INDEX "user_two_factors_userId_idx" ON "user_two_factors"("userId");

-- RefreshTokenRevocation
CREATE TABLE "refresh_token_revocations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "jti" VARCHAR(64) NOT NULL,
    "familyId" VARCHAR(64) NOT NULL,
    "tenantId" UUID,
    "userId" UUID,
    "reason" VARCHAR(32) NOT NULL DEFAULT 'rotated',
    "revokedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "refresh_token_revocations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "refresh_token_revocations_jti_key" ON "refresh_token_revocations"("jti");
CREATE INDEX "refresh_token_revocations_familyId_idx" ON "refresh_token_revocations"("familyId");
CREATE INDEX "refresh_token_revocations_expiresAt_idx" ON "refresh_token_revocations"("expiresAt");
