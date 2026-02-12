-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS "appointments_tenantId_professionalId_startTime_status_idx" ON "appointments"("tenantId", "professionalId", "startTime", "status");
CREATE INDEX IF NOT EXISTS "appointments_tenantId_customerId_status_idx" ON "appointments"("tenantId", "customerId", "status");
CREATE INDEX IF NOT EXISTS "appointments_professionalId_startTime_endTime_idx" ON "appointments"("professionalId", "startTime", "endTime");

-- Add unique constraint to prevent double-booking
CREATE UNIQUE INDEX IF NOT EXISTS "unique_professional_slot" ON "appointments"("professionalId", "startTime");
