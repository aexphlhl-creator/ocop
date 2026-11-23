import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentsService } from './payments.service';

@Injectable()
export class PaymentMaintenanceService {
  private readonly logger = new Logger(PaymentMaintenanceService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly payments: PaymentsService,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async runMaintenance() {
    if (this.running) return;
    this.running = true;
    try {
      await this.reconcileExpiredTransactions();
      await this.processRefunds();
    } finally {
      this.running = false;
    }
  }

  async reconcileExpiredTransactions() {
    const graceMinutes = this.config.get<number>(
      'VNPAY_RECONCILIATION_GRACE_MINUTES',
      5,
    );
    const claimed = await this.prisma.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`WITH candidates AS (
        SELECT "id" FROM "payment_transactions"
        WHERE "status" IN ('PENDING', 'FAILED')
          AND "expires_at" <= CURRENT_TIMESTAMP - (${graceMinutes} * INTERVAL '1 minute')
          AND (
            "last_queried_at" IS NULL OR
            "last_queried_at" <= CURRENT_TIMESTAMP - INTERVAL '5 minutes'
          )
        ORDER BY "expires_at", "id"
        FOR UPDATE SKIP LOCKED
        LIMIT 20
      )
      UPDATE "payment_transactions" AS pt
      SET "last_queried_at" = CURRENT_TIMESTAMP
      FROM candidates
      WHERE pt."id" = candidates."id"
      RETURNING pt."id"`,
    );
    for (const transaction of claimed) {
      const result = await this.payments.reconcileTransaction(
        transaction.id,
        true,
      );
      if (result === 'UNKNOWN') {
        this.logger.warn(
          `Không thể reconcile giao dịch ${transaction.id}; giữ nguyên reservation`,
        );
      }
    }
  }

  async processRefunds() {
    const claimed = await this.prisma.$queryRaw<Array<{ id: string }>>(
      Prisma.sql`WITH candidates AS (
        SELECT "id" FROM "refund_attempts"
        WHERE "retry_count" < 5
          AND (
            ("status" IN ('PENDING', 'FAILED') AND
              ("next_retry_at" IS NULL OR "next_retry_at" <= CURRENT_TIMESTAMP))
            OR
            ("status" = 'PROCESSING' AND
              "updated_at" <= CURRENT_TIMESTAMP - INTERVAL '10 minutes')
          )
        ORDER BY "requested_at", "id"
        FOR UPDATE SKIP LOCKED
        LIMIT 20
      )
      UPDATE "refund_attempts" AS ra
      SET "status" = 'PROCESSING', "updated_at" = CURRENT_TIMESTAMP
      FROM candidates
      WHERE ra."id" = candidates."id"
      RETURNING ra."id"`,
    );
    for (const refund of claimed) {
      await this.payments.processRefundAttempt(refund.id);
    }
  }
}
