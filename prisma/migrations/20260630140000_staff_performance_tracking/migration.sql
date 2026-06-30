ALTER TABLE "Order" ADD COLUMN "placedByUserId" TEXT;
ALTER TABLE "Order" ADD COLUMN "placedByName" TEXT;
ALTER TABLE "Order" ADD COLUMN "paidByUserId" TEXT;
ALTER TABLE "Order" ADD COLUMN "paidByName" TEXT;

ALTER TABLE "OrderItem" ADD COLUMN "preparedByUserId" TEXT;
ALTER TABLE "OrderItem" ADD COLUMN "preparedByName" TEXT;
ALTER TABLE "OrderItem" ADD COLUMN "readyByUserId" TEXT;
ALTER TABLE "OrderItem" ADD COLUMN "readyByName" TEXT;
ALTER TABLE "OrderItem" ADD COLUMN "servedByUserId" TEXT;
ALTER TABLE "OrderItem" ADD COLUMN "servedByName" TEXT;
