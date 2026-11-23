import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GatewayAttemptStatus,
  OrderStatus,
  PaymentAggregateStatus,
  PaymentMethod,
  PaymentTransactionStatus,
  Prisma,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { RequestUser } from '../auth/interfaces/jwt-payload.interface';
import { InventoryReservationService } from '../orders/inventory-reservation.service';
import { PrismaService } from '../prisma/prisma.service';
import { VnpayGateway, VnpayGatewayResult } from './vnpay.gateway';

type TransactionClient = Prisma.TransactionClient;
type ReconciliationResult = 'PAID' | 'UNPAID' | 'UNKNOWN';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly vnpay: VnpayGateway,
    private readonly inventoryReservations: InventoryReservationService,
  ) {}

  async getAggregateStatus(aggregateId: string, user: RequestUser) {
    const aggregate = await this.prisma.paymentAggregate.findUnique({
      where: { id: aggregateId },
      include: this.statusInclude(),
    });
    if (!aggregate) throw new NotFoundException('Không tìm thấy checkout');
    this.assertOwner(aggregate.userId, user);
    return this.toStatusResponse(aggregate);
  }

  async getTransactionStatus(txnRef: string, user: RequestUser) {
    const transaction = await this.prisma.paymentTransaction.findUnique({
      where: { txnRef },
      include: {
        paymentAggregate: { include: this.statusInclude() },
      },
    });
    if (!transaction) throw new NotFoundException('Không tìm thấy giao dịch');
    this.assertOwner(transaction.paymentAggregate.userId, user);
    return this.toStatusResponse(transaction.paymentAggregate);
  }

  async retryPayment(
    aggregateId: string,
    user: RequestUser,
    ipAddress: string,
  ) {
    const snapshot = await this.prisma.paymentAggregate.findUnique({
      where: { id: aggregateId },
      include: {
        transactions: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });
    if (!snapshot) throw new NotFoundException('Không tìm thấy checkout');
    this.assertOwner(snapshot.userId, user);
    if (snapshot.paymentMethod !== PaymentMethod.VNPAY) {
      throw new BadRequestException('COD không tạo phiên thanh toán VNPay');
    }
    const latest = snapshot.transactions[0];
    if (
      latest?.status === PaymentTransactionStatus.PENDING &&
      latest.expiresAt <= new Date()
    ) {
      const reconciled = await this.reconcileTransaction(latest.id, false);
      if (reconciled === 'PAID') {
        return this.getAggregateStatus(aggregateId, user);
      }
      if (reconciled === 'UNKNOWN') {
        throw new ConflictException({
          code: 'PAYMENT_RECONCILIATION_PENDING',
          message:
            'Chưa xác minh được trạng thái phiên cũ; chưa thể tạo giao dịch mới',
        });
      }
    }

    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw(
          Prisma.sql`SELECT "id" FROM "payment_aggregates"
            WHERE "id" = ${aggregateId}::uuid FOR UPDATE`,
        );
        const aggregate = await tx.paymentAggregate.findUnique({
          where: { id: aggregateId },
          include: {
            transactions: { orderBy: { createdAt: 'desc' } },
          },
        });
        if (!aggregate) throw new NotFoundException('Không tìm thấy checkout');
        this.assertOwner(aggregate.userId, user);
        if (
          (
            [
              PaymentAggregateStatus.COMPLETED,
              PaymentAggregateStatus.CANCELLED,
              PaymentAggregateStatus.REFUND_PENDING,
              PaymentAggregateStatus.REFUNDED,
              PaymentAggregateStatus.REFUND_FAILED,
              PaymentAggregateStatus.RECONCILIATION_REQUIRED,
            ] as PaymentAggregateStatus[]
          ).includes(aggregate.status)
        ) {
          throw new ConflictException(
            `Không thể retry checkout ở trạng thái ${aggregate.status}`,
          );
        }
        const active = aggregate.transactions.find(
          (transaction) =>
            transaction.status === PaymentTransactionStatus.PENDING &&
            transaction.expiresAt > new Date(),
        );
        if (active) return this.toRetryResponse(aggregate, active);
        if (aggregate.transactions.length >= 5) {
          throw new ConflictException(
            'Checkout đã đạt số lần tạo phiên thanh toán tối đa',
          );
        }
        await tx.paymentTransaction.updateMany({
          where: {
            paymentAggregateId: aggregate.id,
            status: PaymentTransactionStatus.PENDING,
          },
          data: {
            status: PaymentTransactionStatus.EXPIRED,
            processedAt: new Date(),
          },
        });

        const now = new Date();
        const expiresAt = new Date(
          now.getTime() + this.paymentTimeoutMinutes() * 60_000,
        );
        const txnRef = this.gatewayRequestId();
        const payment = this.vnpay.buildPaymentUrl({
          txnRef,
          amount: aggregate.amount,
          ipAddress,
          createDate: now,
          expiresAt,
        });
        const transaction = await tx.paymentTransaction.create({
          data: {
            paymentAggregateId: aggregate.id,
            txnRef,
            amount: aggregate.amount,
            currency: aggregate.currency,
            paymentUrl: payment.paymentUrl,
            gatewayCreateDate: payment.gatewayCreateDate,
            expiresAt,
          },
        });
        await tx.paymentAggregate.update({
          where: { id: aggregate.id },
          data: {
            status: PaymentAggregateStatus.PENDING,
            reconciliationReason: null,
          },
        });
        return this.toRetryResponse(aggregate, transaction);
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5000,
        timeout: 15000,
      },
    );
  }

  async verifyIpn(query: Record<string, unknown>) {
    const verification = this.vnpay.verifyCallback(query);
    if (!verification.valid) {
      return { RspCode: '97', Message: 'Invalid signature' };
    }
    const params = verification.params;
    if (params.vnp_TmnCode !== this.config.get<string>('VNPAY_TMN_CODE')) {
      return { RspCode: '99', Message: 'Invalid merchant code' };
    }
    const txnRef = params.vnp_TxnRef;
    if (!txnRef) return { RspCode: '01', Message: 'Transaction not found' };
    const existing = await this.prisma.paymentTransaction.findUnique({
      where: { txnRef },
    });
    if (!existing) return { RspCode: '01', Message: 'Transaction not found' };
    const callbackCurrency = params.vnp_CurrCode;
    if (
      existing.currency !== 'VND' ||
      (callbackCurrency && callbackCurrency !== existing.currency)
    ) {
      return { RspCode: '04', Message: 'Invalid currency' };
    }

    const receivedAmount = this.parseGatewayAmount(params.vnp_Amount);
    if (!receivedAmount || !receivedAmount.eq(existing.amount)) {
      return { RspCode: '04', Message: 'Invalid amount' };
    }
    const isSuccess =
      params.vnp_ResponseCode === '00' && params.vnp_TransactionStatus === '00';
    if (isSuccess && existing.status === PaymentTransactionStatus.COMPLETED) {
      return { RspCode: '02', Message: 'Transaction already confirmed' };
    }
    const late =
      existing.status !== PaymentTransactionStatus.PENDING ||
      existing.expiresAt <= new Date();
    if (isSuccess && late) {
      const reconciled = await this.reconcileTransaction(existing.id, false);
      if (reconciled === 'PAID') {
        return { RspCode: '00', Message: 'Reconciled successfully' };
      }
      if (reconciled === 'UNKNOWN') {
        await this.markReconciliationRequired(
          existing.id,
          'Không thể xác minh late-success IPN bằng QUERYDR',
          query,
        );
        return { RspCode: '99', Message: 'Reconciliation required' };
      }
      await this.markReconciliationRequired(
        existing.id,
        'QUERYDR chưa xác nhận late-success IPN là giao dịch đã thanh toán',
        query,
      );
      return { RspCode: '99', Message: 'Gateway state mismatch' };
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw(
          Prisma.sql`SELECT "id" FROM "payment_aggregates"
            WHERE "id" = ${existing.paymentAggregateId}::uuid FOR UPDATE`,
        );
        await tx.$queryRaw(
          Prisma.sql`SELECT "id" FROM "payment_transactions"
            WHERE "txn_ref" = ${txnRef} FOR UPDATE`,
        );
        const transaction = await tx.paymentTransaction.findUnique({
          where: { txnRef },
          include: { paymentAggregate: true },
        });
        if (!transaction) {
          return { RspCode: '01', Message: 'Transaction not found' };
        }
        if (transaction.status === PaymentTransactionStatus.COMPLETED) {
          return { RspCode: '02', Message: 'Transaction already confirmed' };
        }
        const gatewayTxNo = params.vnp_TransactionNo || null;
        const rawIpnPayload = this.vnpay.sanitizePayload(query);

        if (
          !isSuccess &&
          transaction.status !== PaymentTransactionStatus.PENDING
        ) {
          return { RspCode: '02', Message: 'Transaction already processed' };
        }

        if (isSuccess && !gatewayTxNo) {
          return {
            RspCode: '99',
            Message: 'Missing gateway transaction number',
          };
        }
        const duplicateGatewayTransaction = gatewayTxNo
          ? await tx.paymentTransaction.findFirst({
              where: { gatewayTxNo, id: { not: transaction.id } },
            })
          : null;
        if (duplicateGatewayTransaction) {
          await tx.paymentTransaction.update({
            where: { id: transaction.id },
            data: {
              status: PaymentTransactionStatus.RECONCILIATION_REQUIRED,
              receivedAmount,
              responseCode: params.vnp_ResponseCode,
              transactionStatus: params.vnp_TransactionStatus,
              rawIpnPayload,
              processedAt: new Date(),
            },
          });
          await tx.paymentAggregate.update({
            where: { id: transaction.paymentAggregateId },
            data: {
              status: PaymentAggregateStatus.RECONCILIATION_REQUIRED,
              reconciliationReason: `gatewayTxNo ${gatewayTxNo} bị trùng`,
            },
          });
          return { RspCode: '99', Message: 'Duplicate gateway transaction' };
        }

        if (!isSuccess) {
          await tx.paymentTransaction.update({
            where: { id: transaction.id },
            data: {
              status: PaymentTransactionStatus.FAILED,
              receivedAmount,
              gatewayTxNo,
              responseCode: params.vnp_ResponseCode || null,
              transactionStatus: params.vnp_TransactionStatus || null,
              rawIpnPayload,
              processedAt: new Date(),
            },
          });
          await tx.paymentAggregate.updateMany({
            where: {
              id: transaction.paymentAggregateId,
              status: PaymentAggregateStatus.PENDING,
            },
            data: { status: PaymentAggregateStatus.FAILED },
          });
          return { RspCode: '00', Message: 'Failure recorded' };
        }

        await this.applyPaidTransaction(tx, transaction.id, {
          gatewayTxNo,
          receivedAmount,
          responseCode: params.vnp_ResponseCode,
          transactionStatus: params.vnp_TransactionStatus,
          rawIpnPayload,
        });
        return { RspCode: '00', Message: 'Confirm Success' };
      });
    } catch (error) {
      this.logger.error(
        `VNPay IPN processing failed for ${txnRef}`,
        error instanceof Error ? error.stack : String(error),
      );
      return { RspCode: '99', Message: 'Internal processing error' };
    }
  }

  async verifyReturn(query: Record<string, unknown>) {
    const verification = this.vnpay.verifyCallback(query);
    if (!verification.valid) {
      return {
        signatureValid: false,
        success: false,
        message: 'Chữ ký VNPay không hợp lệ',
      };
    }
    const txnRef = verification.params.vnp_TxnRef;
    const transaction = txnRef
      ? await this.prisma.paymentTransaction.findUnique({
          where: { txnRef },
          select: {
            txnRef: true,
            status: true,
            paymentAggregate: { select: { status: true } },
          },
        })
      : null;
    return {
      signatureValid: true,
      txnRef: txnRef || null,
      gatewayReportedSuccess:
        verification.params.vnp_ResponseCode === '00' &&
        verification.params.vnp_TransactionStatus === '00',
      success: transaction?.status === PaymentTransactionStatus.COMPLETED,
      paymentStatus: transaction?.status ?? 'PENDING',
      aggregateStatus: transaction?.paymentAggregate.status ?? 'PENDING',
      message:
        transaction?.status === PaymentTransactionStatus.COMPLETED
          ? 'Thanh toán đã được IPN xác nhận'
          : 'Đang chờ máy chủ xác nhận kết quả thanh toán',
    };
  }

  async reconcileTransaction(
    transactionId: string,
    releaseIfUnpaid: boolean,
  ): Promise<ReconciliationResult> {
    const transaction = await this.prisma.paymentTransaction.findUnique({
      where: { id: transactionId },
    });
    if (!transaction) return 'UNKNOWN';
    if (transaction.status === PaymentTransactionStatus.COMPLETED)
      return 'PAID';
    const requestId = this.gatewayRequestId();
    const queryAttempt = await this.prisma.paymentQueryAttempt.create({
      data: { transactionId, requestId },
    });

    try {
      const result = await this.vnpay.queryTransaction({
        requestId,
        txnRef: transaction.txnRef,
        transactionDate: transaction.gatewayCreateDate,
        transactionNo: transaction.gatewayTxNo,
      });
      const matches = this.gatewayResultMatches(transaction, result);
      await this.prisma.paymentQueryAttempt.update({
        where: { id: queryAttempt.id },
        data: {
          status:
            result.signatureValid && matches
              ? GatewayAttemptStatus.SUCCESS
              : GatewayAttemptStatus.FAILED,
          responseCode: result.responseCode || null,
          transactionStatus: result.transactionStatus || null,
          gatewayResponse: result.raw as Prisma.InputJsonObject,
          failureReason:
            result.signatureValid && matches
              ? null
              : 'QUERYDR signature, txnRef hoặc amount không hợp lệ',
          processedAt: new Date(),
        },
      });
      await this.prisma.paymentTransaction.update({
        where: { id: transaction.id },
        data: { lastQueriedAt: new Date() },
      });
      if (!result.signatureValid || !matches) return 'UNKNOWN';
      if (result.paid) {
        await this.prisma.$transaction(async (tx) => {
          await tx.$queryRaw(
            Prisma.sql`SELECT "id" FROM "payment_aggregates"
              WHERE "id" = ${transaction.paymentAggregateId}::uuid FOR UPDATE`,
          );
          await tx.$queryRaw(
            Prisma.sql`SELECT "id" FROM "payment_transactions"
              WHERE "id" = ${transaction.id}::uuid FOR UPDATE`,
          );
          await this.applyPaidTransaction(tx, transaction.id, {
            gatewayTxNo: result.transactionNo ?? null,
            receivedAmount: transaction.amount,
            responseCode: result.responseCode,
            transactionStatus: result.transactionStatus,
            rawIpnPayload: result.raw as Prisma.InputJsonObject,
          });
        });
        return 'PAID';
      }
      if (result.responseCode === '00') {
        await this.markUnpaidTransaction(transaction.id, releaseIfUnpaid);
        return 'UNPAID';
      }
      return 'UNKNOWN';
    } catch (error) {
      await this.prisma.paymentQueryAttempt.update({
        where: { id: queryAttempt.id },
        data: {
          status: GatewayAttemptStatus.FAILED,
          failureReason: error instanceof Error ? error.message : String(error),
          processedAt: new Date(),
        },
      });
      this.logger.warn(
        `QUERYDR failed for ${transaction.txnRef}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return 'UNKNOWN';
    }
  }

  async processRefundAttempt(attemptId: string) {
    const attempt = await this.prisma.refundAttempt.findUnique({
      where: { id: attemptId },
      include: { transaction: true },
    });
    if (!attempt || attempt.status === GatewayAttemptStatus.SUCCESS) return;
    try {
      const result = await this.vnpay.refund({
        requestId: attempt.merchantRequestId,
        txnRef: attempt.transaction.txnRef,
        transactionDate: attempt.transaction.gatewayCreateDate,
        transactionNo: attempt.transaction.gatewayTxNo,
        amount: attempt.amount,
        transactionType: attempt.refundType === 'FULL' ? '02' : '03',
        createdBy: attempt.requestedBy,
      });
      const success =
        result.signatureValid &&
        result.responseCode === '00' &&
        result.transactionStatus === '00';
      await this.prisma.$transaction(async (tx) => {
        await tx.refundAttempt.update({
          where: { id: attempt.id },
          data: success
            ? {
                status: GatewayAttemptStatus.SUCCESS,
                gatewayRefundTxNo: result.refundTransactionNo,
                responseCode: result.responseCode,
                transactionStatus: result.transactionStatus,
                gatewayResponse: result.raw as Prisma.InputJsonObject,
                processedAt: new Date(),
                failureReason: null,
                nextRetryAt: null,
              }
            : this.refundFailureUpdate(
                attempt.retryCount,
                result.responseCode || 'INVALID_RESPONSE',
                result,
              ),
        });
        if (success) {
          await tx.paymentAggregate.update({
            where: { id: attempt.paymentAggregateId },
            data: { status: PaymentAggregateStatus.REFUNDED },
          });
          await tx.order.updateMany({
            where: { paymentAggregateId: attempt.paymentAggregateId },
            data: { paymentStatus: 'REFUNDED' },
          });
        } else if (attempt.retryCount + 1 >= 5) {
          await tx.paymentAggregate.update({
            where: { id: attempt.paymentAggregateId },
            data: { status: PaymentAggregateStatus.REFUND_FAILED },
          });
          await tx.order.updateMany({
            where: { paymentAggregateId: attempt.paymentAggregateId },
            data: { paymentStatus: 'REFUND_FAILED' },
          });
        }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.prisma.$transaction(async (tx) => {
        await tx.refundAttempt.update({
          where: { id: attempt.id },
          data: this.refundFailureUpdate(attempt.retryCount, message),
        });
        if (attempt.retryCount + 1 >= 5) {
          await tx.paymentAggregate.update({
            where: { id: attempt.paymentAggregateId },
            data: { status: PaymentAggregateStatus.REFUND_FAILED },
          });
          await tx.order.updateMany({
            where: { paymentAggregateId: attempt.paymentAggregateId },
            data: { paymentStatus: 'REFUND_FAILED' },
          });
        }
      });
    }
  }

  private async applyPaidTransaction(
    tx: TransactionClient,
    transactionId: string,
    payment: {
      gatewayTxNo: string | null;
      receivedAmount: Prisma.Decimal;
      responseCode: string;
      transactionStatus: string;
      rawIpnPayload: Prisma.InputJsonObject;
    },
  ) {
    const transaction = await tx.paymentTransaction.findUniqueOrThrow({
      where: { id: transactionId },
    });
    if (transaction.status === PaymentTransactionStatus.COMPLETED) return;
    if (payment.gatewayTxNo) {
      const duplicate = await tx.paymentTransaction.findFirst({
        where: {
          gatewayTxNo: payment.gatewayTxNo,
          id: { not: transaction.id },
        },
      });
      if (duplicate) {
        throw new ConflictException(
          'Mã giao dịch VNPay đã thuộc checkout khác',
        );
      }
    }
    const aggregateOrderIds = (
      await tx.order.findMany({
        where: { paymentAggregateId: transaction.paymentAggregateId },
        select: { id: true },
        orderBy: { id: 'asc' },
      })
    ).map((order) => order.id);
    if (aggregateOrderIds.length > 0) {
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "orders"
          WHERE "id" IN (${Prisma.join(
            aggregateOrderIds.map((orderId) => Prisma.sql`${orderId}::uuid`),
          )})
          ORDER BY "id" FOR UPDATE`,
      );
    }
    const recoverable = await this.inventoryReservations.isAggregateRecoverable(
      tx,
      transaction.paymentAggregateId,
    );
    await tx.paymentTransaction.update({
      where: { id: transaction.id },
      data: {
        status: PaymentTransactionStatus.COMPLETED,
        receivedAmount: payment.receivedAmount,
        gatewayTxNo: payment.gatewayTxNo,
        responseCode: payment.responseCode,
        transactionStatus: payment.transactionStatus,
        rawIpnPayload: payment.rawIpnPayload,
        processedAt: new Date(),
      },
    });
    if (recoverable) {
      await tx.paymentAggregate.update({
        where: { id: transaction.paymentAggregateId },
        data: {
          status: PaymentAggregateStatus.COMPLETED,
          completedAt: new Date(),
          reconciliationReason: null,
        },
      });
      await tx.order.updateMany({
        where: {
          paymentAggregateId: transaction.paymentAggregateId,
          status: OrderStatus.PENDING,
        },
        data: { status: OrderStatus.CONFIRMED, paymentStatus: 'COMPLETED' },
      });
      await tx.order.updateMany({
        where: {
          paymentAggregateId: transaction.paymentAggregateId,
          status: { not: OrderStatus.CANCELLED },
        },
        data: { paymentStatus: 'COMPLETED' },
      });
      await tx.orderTracking.createMany({
        data: aggregateOrderIds.map((orderId) => ({
          orderId,
          status: OrderStatus.CONFIRMED,
          description: 'Thanh toán VNPay đã được IPN/QUERYDR xác nhận',
        })),
      });
      return;
    }

    await tx.paymentAggregate.update({
      where: { id: transaction.paymentAggregateId },
      data: {
        status: PaymentAggregateStatus.REFUND_PENDING,
        reconciliationReason:
          'Gateway đã thu tiền nhưng đơn hàng/reservation không còn recoverable',
      },
    });
    await tx.order.updateMany({
      where: { paymentAggregateId: transaction.paymentAggregateId },
      data: { paymentStatus: 'REFUND_PENDING' },
    });
    await tx.refundAttempt.upsert({
      where: {
        paymentAggregateId_idempotencyKey: {
          paymentAggregateId: transaction.paymentAggregateId,
          idempotencyKey: `late-success:${transaction.id}`,
        },
      },
      update: {},
      create: {
        paymentAggregateId: transaction.paymentAggregateId,
        transactionId: transaction.id,
        idempotencyKey: `late-success:${transaction.id}`,
        merchantRequestId: this.gatewayRequestId(),
        amount: payment.receivedAmount,
        currency: transaction.currency,
        requestedBy: this.config.get<string>(
          'VNPAY_REFUND_CREATED_BY',
          'OCOP_SYSTEM',
        ),
      },
    });
  }

  private async markUnpaidTransaction(
    transactionId: string,
    releaseIfUnpaid: boolean,
  ) {
    const snapshot = await this.prisma.paymentTransaction.findUnique({
      where: { id: transactionId },
      select: { paymentAggregateId: true },
    });
    if (!snapshot) return;
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "payment_aggregates"
          WHERE "id" = ${snapshot.paymentAggregateId}::uuid FOR UPDATE`,
      );
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "payment_transactions"
          WHERE "id" = ${transactionId}::uuid FOR UPDATE`,
      );
      const transaction = await tx.paymentTransaction.findUniqueOrThrow({
        where: { id: transactionId },
      });
      if (transaction.status === PaymentTransactionStatus.COMPLETED) return;
      await tx.paymentTransaction.update({
        where: { id: transaction.id },
        data: {
          status: PaymentTransactionStatus.EXPIRED,
          processedAt: new Date(),
        },
      });
      if (!releaseIfUnpaid) return;
      const aggregate = await tx.paymentAggregate.findUnique({
        where: { id: transaction.paymentAggregateId },
        select: { status: true },
      });
      if (
        !aggregate ||
        !(
          [
            PaymentAggregateStatus.PENDING,
            PaymentAggregateStatus.FAILED,
          ] as PaymentAggregateStatus[]
        ).includes(aggregate.status)
      ) {
        return;
      }
      const activeAttempt = await tx.paymentTransaction.findFirst({
        where: {
          paymentAggregateId: transaction.paymentAggregateId,
          status: PaymentTransactionStatus.PENDING,
          id: { not: transaction.id },
        },
      });
      if (activeAttempt) return;
      await this.inventoryReservations.releaseAggregate(
        tx,
        transaction.paymentAggregateId,
      );
      await tx.order.updateMany({
        where: {
          paymentAggregateId: transaction.paymentAggregateId,
          status: { in: [OrderStatus.PENDING, OrderStatus.CONFIRMED] },
        },
        data: { status: OrderStatus.CANCELLED, paymentStatus: 'FAILED' },
      });
      await tx.paymentAggregate.update({
        where: { id: transaction.paymentAggregateId },
        data: { status: PaymentAggregateStatus.EXPIRED },
      });
    });
  }

  private async markReconciliationRequired(
    transactionId: string,
    reason: string,
    payload: Record<string, unknown>,
  ) {
    const snapshot = await this.prisma.paymentTransaction.findUnique({
      where: { id: transactionId },
      select: { paymentAggregateId: true },
    });
    if (!snapshot) return;
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "payment_aggregates"
          WHERE "id" = ${snapshot.paymentAggregateId}::uuid FOR UPDATE`,
      );
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "payment_transactions"
          WHERE "id" = ${transactionId}::uuid FOR UPDATE`,
      );
      const [transaction, aggregate] = await Promise.all([
        tx.paymentTransaction.findUnique({
          where: { id: transactionId },
          select: { status: true },
        }),
        tx.paymentAggregate.findUnique({
          where: { id: snapshot.paymentAggregateId },
          select: { status: true },
        }),
      ]);
      if (
        !transaction ||
        !aggregate ||
        transaction.status === PaymentTransactionStatus.COMPLETED ||
        (
          [
            PaymentAggregateStatus.COMPLETED,
            PaymentAggregateStatus.REFUND_PENDING,
            PaymentAggregateStatus.REFUNDED,
            PaymentAggregateStatus.REFUND_FAILED,
          ] as PaymentAggregateStatus[]
        ).includes(aggregate.status)
      ) {
        return;
      }
      await tx.paymentTransaction.update({
        where: { id: transactionId },
        data: {
          status: PaymentTransactionStatus.RECONCILIATION_REQUIRED,
          rawIpnPayload: this.vnpay.sanitizePayload(payload),
          processedAt: new Date(),
        },
      });
      await tx.paymentAggregate.update({
        where: { id: snapshot.paymentAggregateId },
        data: {
          status: PaymentAggregateStatus.RECONCILIATION_REQUIRED,
          reconciliationReason: reason,
        },
      });
    });
  }

  private refundFailureUpdate(
    currentRetryCount: number,
    reason: string,
    result?: VnpayGatewayResult,
  ): Prisma.RefundAttemptUpdateInput {
    const nextRetryCount = currentRetryCount + 1;
    const delayMinutes = Math.min(60, 2 ** nextRetryCount);
    return {
      status: GatewayAttemptStatus.FAILED,
      retryCount: nextRetryCount,
      responseCode: result?.responseCode || null,
      transactionStatus: result?.transactionStatus || null,
      gatewayResponse: result?.raw as Prisma.InputJsonObject | undefined,
      failureReason: reason.slice(0, 2000),
      processedAt: new Date(),
      nextRetryAt:
        nextRetryCount >= 5
          ? null
          : new Date(Date.now() + delayMinutes * 60_000),
    };
  }

  private gatewayResultMatches(
    transaction: { txnRef: string; amount: Prisma.Decimal },
    result: VnpayGatewayResult,
  ) {
    const gatewayTxnRef = result.raw.vnp_TxnRef;
    const rawTxnRef = typeof gatewayTxnRef === 'string' ? gatewayTxnRef : '';
    const amount = this.parseGatewayAmount(result.amount);
    return (
      rawTxnRef === transaction.txnRef &&
      Boolean(amount?.eq(transaction.amount))
    );
  }

  private parseGatewayAmount(value?: string) {
    const raw = value ?? '';
    if (!/^\d{1,12}$/.test(raw)) return null;
    return new Prisma.Decimal(raw).div(100);
  }

  private gatewayRequestId() {
    return randomUUID().replace(/-/g, '');
  }

  private paymentTimeoutMinutes() {
    return this.config.get<number>('VNPAY_PAYMENT_TIMEOUT_MINUTES', 15);
  }

  private assertOwner(ownerId: string, user: RequestUser) {
    if (ownerId !== user.id && user.role !== 'ADMIN') {
      throw new ForbiddenException('Bạn không có quyền truy cập checkout này');
    }
  }

  private statusInclude() {
    return {
      orders: {
        orderBy: { sellerId: 'asc' as const },
        select: {
          id: true,
          sellerId: true,
          status: true,
          paymentStatus: true,
          totalAmount: true,
        },
      },
      transactions: {
        orderBy: { createdAt: 'desc' as const },
        select: {
          txnRef: true,
          status: true,
          paymentUrl: true,
          expiresAt: true,
          responseCode: true,
          transactionStatus: true,
        },
      },
    };
  }

  private toStatusResponse(aggregate: {
    id: string;
    status: string;
    amount: Prisma.Decimal;
    currency: string;
    paymentMethod: PaymentMethod;
    reconciliationReason: string | null;
    orders: Array<{
      id: string;
      sellerId: string;
      status: string;
      paymentStatus: string;
      totalAmount: Prisma.Decimal;
    }>;
    transactions: Array<{
      txnRef: string;
      status: string;
      paymentUrl: string;
      expiresAt: Date;
      responseCode: string | null;
      transactionStatus: string | null;
    }>;
  }) {
    return {
      aggregateId: aggregate.id,
      status: aggregate.status,
      paymentMethod: aggregate.paymentMethod,
      amount: aggregate.amount.toFixed(2),
      currency: aggregate.currency,
      reconciliationReason: aggregate.reconciliationReason,
      orders: aggregate.orders.map((order) => ({
        ...order,
        totalAmount: order.totalAmount.toFixed(2),
      })),
      transactions: aggregate.transactions.map((transaction) => ({
        ...transaction,
        paymentUrl:
          transaction.status === PaymentTransactionStatus.PENDING
            ? transaction.paymentUrl
            : undefined,
      })),
    };
  }

  private toRetryResponse(
    aggregate: { id: string; status: string },
    transaction: {
      txnRef: string;
      paymentUrl: string;
      status: string;
      expiresAt: Date;
    },
  ) {
    return {
      aggregateId: aggregate.id,
      aggregateStatus: aggregate.status,
      txnRef: transaction.txnRef,
      status: transaction.status,
      paymentUrl: transaction.paymentUrl,
      expiresAt: transaction.expiresAt,
    };
  }
}
