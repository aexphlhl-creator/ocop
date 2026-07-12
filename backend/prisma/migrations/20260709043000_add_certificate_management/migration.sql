-- CreateEnum
CREATE TYPE "CertificateStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'REVOKED', 'PENDING');

-- CreateTable
CREATE TABLE "certificate_types" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "certificate_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "certificates" (
    "id" UUID NOT NULL,
    "certificate_number" TEXT NOT NULL,
    "certificate_type_id" UUID NOT NULL,
    "product_id" UUID,
    "batch_id" UUID,
    "issuing_organization" TEXT NOT NULL,
    "issue_date" TIMESTAMP(3) NOT NULL,
    "expiry_date" TIMESTAMP(3) NOT NULL,
    "status" "CertificateStatus" NOT NULL DEFAULT 'ACTIVE',
    "verification_url" TEXT,
    "note" TEXT,
    "created_by" UUID NOT NULL,
    "document_hash" TEXT NOT NULL,
    "blockchain_tx_hash" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "certificates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "certificate_files" (
    "id" UUID NOT NULL,
    "certificate_id" UUID NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_url" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "certificate_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "certificate_types_code_key" ON "certificate_types"("code");
CREATE INDEX "certificates_certificate_type_id_idx" ON "certificates"("certificate_type_id");
CREATE INDEX "certificates_product_id_idx" ON "certificates"("product_id");
CREATE INDEX "certificates_batch_id_idx" ON "certificates"("batch_id");
CREATE INDEX "certificates_status_idx" ON "certificates"("status");
CREATE INDEX "certificates_expiry_date_idx" ON "certificates"("expiry_date");
CREATE INDEX "certificates_deleted_at_idx" ON "certificates"("deleted_at");
CREATE INDEX "certificate_files_certificate_id_idx" ON "certificate_files"("certificate_id");

-- AddForeignKey
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_certificate_type_id_fkey" FOREIGN KEY ("certificate_type_id") REFERENCES "certificate_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "certificate_files" ADD CONSTRAINT "certificate_files_certificate_id_fkey" FOREIGN KEY ("certificate_id") REFERENCES "certificates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
