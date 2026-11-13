-- AlterTable
ALTER TABLE "appointments" ADD COLUMN     "confirmedAt" TIMESTAMP(3),
ADD COLUMN     "notificationError" TEXT,
ADD COLUMN     "notifiedAt" TIMESTAMP(3);
