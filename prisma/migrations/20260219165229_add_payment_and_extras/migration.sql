-- AlterTable
ALTER TABLE "appointments" ADD COLUMN "isPaid" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "paidAt" TIMESTAMP(3),
ADD COLUMN "paymentMethod" TEXT,
ADD COLUMN "playerCount" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "totalAmount" DECIMAL(10,2);

-- CreateTable
CREATE TABLE "appointment_extras" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unitPrice" DECIMAL(10,2) NOT NULL,
    "dividedAmong" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "appointment_extras_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "appointment_extras_appointmentId_idx" ON "appointment_extras"("appointmentId");

-- AddForeignKey
ALTER TABLE "appointment_extras" ADD CONSTRAINT "appointment_extras_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
