-- AlterTable
ALTER TABLE "tenants" ADD COLUMN "cancellationHoursLimit" INTEGER NOT NULL DEFAULT 24;

-- AlterTable
ALTER TABLE "magic_link_tokens" ADD COLUMN "type" TEXT NOT NULL DEFAULT 'admin',
ADD COLUMN "customerId" TEXT;
