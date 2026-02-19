-- CreateTable
CREATE TABLE "recurring_series" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "professionalId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "weeksAhead" INTEGER NOT NULL DEFAULT 8,
    "seriesStart" TIMESTAMP(3) NOT NULL,
    "seriesEnd" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recurring_series_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "appointments" ADD COLUMN "recurringSeriesId" TEXT;
ALTER TABLE "appointments" ADD COLUMN "recurringSeriesIdx" INTEGER;

-- CreateIndex
CREATE INDEX "recurring_series_tenantId_idx" ON "recurring_series"("tenantId");
CREATE INDEX "recurring_series_tenantId_isActive_idx" ON "recurring_series"("tenantId", "isActive");
CREATE INDEX "recurring_series_customerId_idx" ON "recurring_series"("customerId");

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_recurringSeriesId_fkey" FOREIGN KEY ("recurringSeriesId") REFERENCES "recurring_series"("id") ON DELETE SET NULL ON UPDATE CASCADE;
