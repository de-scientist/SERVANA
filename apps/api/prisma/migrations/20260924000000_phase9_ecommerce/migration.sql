-- Phase 9 — product marketplace order lifecycle + curated cross-sell links.
-- OrderStatus: CREATED -> PENDING, FULFILLMENT -> PROCESSING, plus new READY state.
-- No orders exist yet (no order code shipped before this phase), so a straight
-- enum replacement is safe: map legacy labels just in case, then swap.

ALTER TYPE "OrderStatus" RENAME TO "OrderStatus_old";

CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'PAID', 'PROCESSING', 'READY', 'SHIPPED', 'DELIVERED', 'COMPLETED', 'CANCELLED', 'REFUNDED');

ALTER TABLE "Order" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Order" ALTER COLUMN "status" TYPE "OrderStatus" USING (
  CASE "status"::text
    WHEN 'CREATED' THEN 'PENDING'::"OrderStatus"
    WHEN 'FULFILLMENT' THEN 'PROCESSING'::"OrderStatus"
    ELSE "status"::text::"OrderStatus"
  END
);
ALTER TABLE "Order" ALTER COLUMN "status" SET DEFAULT 'PENDING';

ALTER TABLE "OrderStatusHistory" ALTER COLUMN "from" TYPE "OrderStatus" USING (
  CASE "from"::text
    WHEN 'CREATED' THEN 'PENDING'::"OrderStatus"
    WHEN 'FULFILLMENT' THEN 'PROCESSING'::"OrderStatus"
    ELSE "from"::text::"OrderStatus"
  END
);
ALTER TABLE "OrderStatusHistory" ALTER COLUMN "to" TYPE "OrderStatus" USING (
  CASE "to"::text
    WHEN 'CREATED' THEN 'PENDING'::"OrderStatus"
    WHEN 'FULFILLMENT' THEN 'PROCESSING'::"OrderStatus"
    ELSE "to"::text::"OrderStatus"
  END
);

DROP TYPE "OrderStatus_old";

-- Curated deterministic cross-sell links (catalog service -> product).
CREATE TABLE "ServiceProductLink" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "reason" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceProductLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ServiceProductLink_serviceId_productId_key" ON "ServiceProductLink"("serviceId", "productId");
CREATE INDEX "ServiceProductLink_serviceId_sortOrder_idx" ON "ServiceProductLink"("serviceId", "sortOrder");

ALTER TABLE "ServiceProductLink" ADD CONSTRAINT "ServiceProductLink_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServiceProductLink" ADD CONSTRAINT "ServiceProductLink_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Product images (array of { key, url }, same convention as portfolio images).
ALTER TABLE "Product" ADD COLUMN "images" JSONB;
