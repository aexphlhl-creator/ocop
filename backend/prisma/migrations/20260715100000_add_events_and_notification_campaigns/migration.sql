-- Add missing role value used by Events and Notification Campaign controllers.
ALTER TYPE "RoleName" ADD VALUE IF NOT EXISTS 'EVENT_COORDINATOR';

-- CreateEnum
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EventStatus') THEN
        CREATE TYPE "EventStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ONGOING', 'COMPLETED', 'CANCELLED');
    END IF;
END $$;

-- CreateEnum
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'NotificationCampaignStatus') THEN
        CREATE TYPE "NotificationCampaignStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'SENDING', 'COMPLETED', 'CANCELLED', 'FAILED');
    END IF;
END $$;

-- CreateEnum
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'NotificationTarget') THEN
        CREATE TYPE "NotificationTarget" AS ENUM ('SELLERS', 'CUSTOMERS', 'ALL', 'BUSINESSES', 'PROVINCES', 'WARDS');
    END IF;
END $$;

-- CreateEnum
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DeliveryStatus') THEN
        CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');
    END IF;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "events" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "summary" TEXT,
    "banner" TEXT,
    "cover_image" TEXT,
    "location" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "registration_deadline" TIMESTAMP(3),
    "organizer" TEXT,
    "event_type" TEXT,
    "is_featured" BOOLEAN NOT NULL DEFAULT false,
    "is_public" BOOLEAN NOT NULL DEFAULT true,
    "registration_required" BOOLEAN NOT NULL DEFAULT false,
    "max_participants" INTEGER,
    "current_participants" INTEGER NOT NULL DEFAULT 0,
    "contact_email" TEXT,
    "contact_phone" TEXT,
    "status" "EventStatus" NOT NULL DEFAULT 'DRAFT',
    "created_by_id" UUID NOT NULL,
    "updated_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "notification_campaigns" (
    "id" UUID NOT NULL,
    "event_id" UUID,
    "target_audience" "NotificationTarget" NOT NULL,
    "target_details" JSONB,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "scheduled_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3),
    "status" "NotificationCampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "total_recipients" INTEGER NOT NULL DEFAULT 0,
    "sent_count" INTEGER NOT NULL DEFAULT 0,
    "failed_count" INTEGER NOT NULL DEFAULT 0,
    "read_count" INTEGER NOT NULL DEFAULT 0,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "notification_recipients" (
    "id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "delivery_status" "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "events_slug_key" ON "events"("slug");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "events_status_idx" ON "events"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "events_start_date_idx" ON "events"("start_date");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "events_slug_idx" ON "events"("slug");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "notification_campaigns_status_idx" ON "notification_campaigns"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "notification_campaigns_scheduled_at_idx" ON "notification_campaigns"("scheduled_at");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "notification_recipients_campaign_id_user_id_key" ON "notification_recipients"("campaign_id", "user_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "notification_recipients_user_id_idx" ON "notification_recipients"("user_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "notification_recipients_delivery_status_idx" ON "notification_recipients"("delivery_status");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'events_created_by_id_fkey') THEN
        ALTER TABLE "events" ADD CONSTRAINT "events_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'events_updated_by_id_fkey') THEN
        ALTER TABLE "events" ADD CONSTRAINT "events_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notification_campaigns_event_id_fkey') THEN
        ALTER TABLE "notification_campaigns" ADD CONSTRAINT "notification_campaigns_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notification_campaigns_created_by_id_fkey') THEN
        ALTER TABLE "notification_campaigns" ADD CONSTRAINT "notification_campaigns_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notification_recipients_campaign_id_fkey') THEN
        ALTER TABLE "notification_recipients" ADD CONSTRAINT "notification_recipients_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "notification_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'notification_recipients_user_id_fkey') THEN
        ALTER TABLE "notification_recipients" ADD CONSTRAINT "notification_recipients_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
