-- AlterTable
ALTER TABLE "products" ADD COLUMN     "approved_at" TIMESTAMP(3),
ADD COLUMN     "approved_by_id" UUID,
ADD COLUMN     "reject_reason" TEXT;

-- CreateTable
CREATE TABLE "product_approval_histories" (
    "id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "admin_id" UUID NOT NULL,
    "old_status" "ProductStatus" NOT NULL,
    "new_status" "ProductStatus" NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_approval_histories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "product_approval_histories_product_id_idx" ON "product_approval_histories"("product_id");

-- CreateIndex
CREATE INDEX "product_approval_histories_admin_id_idx" ON "product_approval_histories"("admin_id");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_approval_histories" ADD CONSTRAINT "product_approval_histories_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_approval_histories" ADD CONSTRAINT "product_approval_histories_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
