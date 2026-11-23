import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { createHmac, timingSafeEqual } from 'crypto';

type StringMap = Record<string, string>;
type JsonMap = Record<string, unknown>;

export interface VnpayPaymentUrlInput {
  txnRef: string;
  amount: Prisma.Decimal;
  ipAddress: string;
  createDate: Date;
  expiresAt: Date;
}

export interface VnpayQueryInput {
  requestId: string;
  txnRef: string;
  transactionDate: string;
  transactionNo?: string | null;
}

export interface VnpayRefundInput extends VnpayQueryInput {
  amount: Prisma.Decimal;
  transactionType: '02' | '03';
  createdBy: string;
}

export interface VnpayGatewayResult {
  signatureValid: boolean;
  responseCode: string;
  transactionStatus: string;
  transactionNo?: string;
  refundTransactionNo?: string;
  amount?: string;
  paid: boolean;
  raw: JsonMap;
}

@Injectable()
export class VnpayGateway {
  constructor(private readonly config: ConfigService) {}

  isConfigured() {
    return Boolean(
      this.config.get<string>('VNPAY_TMN_CODE')?.trim() &&
      this.config.get<string>('VNPAY_HASH_SECRET')?.trim(),
    );
  }

  buildPaymentUrl(input: VnpayPaymentUrlInput) {
    const { tmnCode, secret } = this.credentials();
    const paymentUrl = this.config.get<string>(
      'VNPAY_URL',
      'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html',
    );
    const returnUrl = this.config.get<string>(
      'VNPAY_RETURN_URL',
      'http://localhost:3000/checkout/callback',
    );

    const params: StringMap = {
      vnp_Version: '2.1.0',
      vnp_Command: 'pay',
      vnp_TmnCode: tmnCode,
      vnp_Locale: 'vn',
      vnp_CurrCode: 'VND',
      vnp_TxnRef: input.txnRef,
      vnp_OrderInfo: `Thanh toan OCOP ${input.txnRef}`,
      vnp_OrderType: 'other',
      vnp_Amount: input.amount.mul(100).toFixed(0),
      vnp_ReturnUrl: returnUrl,
      vnp_IpAddr: this.normalizeIp(input.ipAddress),
      vnp_CreateDate: this.formatGatewayDate(input.createDate),
      vnp_ExpireDate: this.formatGatewayDate(input.expiresAt),
    };
    const query = this.toSignedQuery(params, secret);
    return {
      paymentUrl: `${paymentUrl}?${query}`,
      gatewayCreateDate: params.vnp_CreateDate,
    };
  }

  verifyCallback(input: Record<string, unknown>) {
    const { secret } = this.credentials();
    const secureHash = this.asString(input.vnp_SecureHash);
    const params = this.vnpStringParams(input, [
      'vnp_SecureHash',
      'vnp_SecureHashType',
    ]);
    if (!secureHash || !/^[0-9a-fA-F]{128}$/.test(secureHash)) {
      return { valid: false, params };
    }

    const expected = this.hmac(this.toQuery(params), secret);
    const receivedBuffer = Buffer.from(secureHash.toLowerCase(), 'hex');
    const expectedBuffer = Buffer.from(expected, 'hex');
    const valid =
      receivedBuffer.length === expectedBuffer.length &&
      timingSafeEqual(receivedBuffer, expectedBuffer);
    return { valid, params };
  }

  async queryTransaction(input: VnpayQueryInput): Promise<VnpayGatewayResult> {
    const { tmnCode, secret } = this.credentials();
    const createDate = this.formatGatewayDate(new Date());
    const ipAddress = this.serverIp();
    const orderInfo = `Truy van giao dich ${input.txnRef}`;
    const hashData = [
      input.requestId,
      '2.1.0',
      'querydr',
      tmnCode,
      input.txnRef,
      input.transactionDate,
      createDate,
      ipAddress,
      orderInfo,
    ].join('|');
    const body: StringMap = {
      vnp_RequestId: input.requestId,
      vnp_Version: '2.1.0',
      vnp_Command: 'querydr',
      vnp_TmnCode: tmnCode,
      vnp_TxnRef: input.txnRef,
      vnp_OrderInfo: orderInfo,
      vnp_TransactionDate: input.transactionDate,
      vnp_CreateDate: createDate,
      vnp_IpAddr: ipAddress,
      vnp_SecureHash: this.hmac(hashData, secret),
    };
    if (input.transactionNo) {
      body.vnp_TransactionNo = input.transactionNo;
    }

    const raw = await this.postGateway(body);
    return this.parseApiResult(raw, secret);
  }

  async refund(input: VnpayRefundInput): Promise<VnpayGatewayResult> {
    const { tmnCode, secret } = this.credentials();
    const createDate = this.formatGatewayDate(new Date());
    const ipAddress = this.serverIp();
    const orderInfo = `Hoan tien giao dich ${input.txnRef}`;
    const transactionNo = input.transactionNo ?? '';
    const amount = input.amount.mul(100).toFixed(0);
    const hashData = [
      input.requestId,
      '2.1.0',
      'refund',
      tmnCode,
      input.transactionType,
      input.txnRef,
      amount,
      transactionNo,
      input.transactionDate,
      input.createdBy,
      createDate,
      ipAddress,
      orderInfo,
    ].join('|');
    const body: StringMap = {
      vnp_RequestId: input.requestId,
      vnp_Version: '2.1.0',
      vnp_Command: 'refund',
      vnp_TmnCode: tmnCode,
      vnp_TransactionType: input.transactionType,
      vnp_TxnRef: input.txnRef,
      vnp_Amount: amount,
      vnp_TransactionNo: transactionNo,
      vnp_TransactionDate: input.transactionDate,
      vnp_CreateBy: input.createdBy,
      vnp_CreateDate: createDate,
      vnp_IpAddr: ipAddress,
      vnp_OrderInfo: orderInfo,
      vnp_SecureHash: this.hmac(hashData, secret),
    };

    const raw = await this.postGateway(body);
    return this.parseApiResult(raw, secret);
  }

  sanitizePayload(input: Record<string, unknown>): Prisma.InputJsonObject {
    const output: Record<string, Prisma.InputJsonValue> = {};
    for (const [key, value] of Object.entries(input)) {
      if (
        key.startsWith('vnp_') &&
        key !== 'vnp_SecureHash' &&
        key !== 'vnp_SecureHashType'
      ) {
        output[key] = this.asString(value).slice(0, 1000);
      }
    }
    return output;
  }

  formatGatewayDate(date: Date) {
    const vietnamTime = new Date(date.getTime() + 7 * 60 * 60 * 1000);
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${vietnamTime.getUTCFullYear()}${pad(
      vietnamTime.getUTCMonth() + 1,
    )}${pad(vietnamTime.getUTCDate())}${pad(
      vietnamTime.getUTCHours(),
    )}${pad(vietnamTime.getUTCMinutes())}${pad(vietnamTime.getUTCSeconds())}`;
  }

  private async postGateway(body: StringMap): Promise<JsonMap> {
    const url = this.config.get<string>(
      'VNPAY_API_URL',
      'https://sandbox.vnpayment.vn/merchant_webapi/api/transaction',
    );
    const timeout = this.config.get<number>('VNPAY_API_TIMEOUT_MS', 5000);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`VNPay HTTP ${response.status}`);
      }
      const parsed: unknown = await response.json();
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('VNPay returned an invalid JSON body');
      }
      return parsed as JsonMap;
    } finally {
      clearTimeout(timer);
    }
  }

  private parseApiResult(raw: JsonMap, secret: string): VnpayGatewayResult {
    const fields = [
      'vnp_ResponseId',
      'vnp_Command',
      'vnp_ResponseCode',
      'vnp_Message',
      'vnp_TmnCode',
      'vnp_TxnRef',
      'vnp_Amount',
      'vnp_BankCode',
      'vnp_PayDate',
      'vnp_TransactionNo',
      'vnp_TransactionType',
      'vnp_TransactionStatus',
      'vnp_OrderInfo',
      'vnp_PromotionCode',
      'vnp_PromotionAmount',
    ];
    const hashData = fields.map((field) => this.asString(raw[field])).join('|');
    const received = this.asString(raw.vnp_SecureHash).toLowerCase();
    const expected = this.hmac(hashData, secret);
    const signatureValid =
      /^[0-9a-f]{128}$/.test(received) &&
      timingSafeEqual(
        Buffer.from(received, 'hex'),
        Buffer.from(expected, 'hex'),
      );
    const responseCode = this.asString(raw.vnp_ResponseCode);
    const transactionStatus = this.asString(raw.vnp_TransactionStatus);
    return {
      signatureValid,
      responseCode,
      transactionStatus,
      transactionNo: this.asString(raw.vnp_TransactionNo) || undefined,
      refundTransactionNo: this.asString(raw.vnp_TransactionNo) || undefined,
      amount: this.asString(raw.vnp_Amount) || undefined,
      paid:
        signatureValid && responseCode === '00' && transactionStatus === '00',
      raw: this.withoutSecureHash(raw),
    };
  }

  private toSignedQuery(params: StringMap, secret: string) {
    const query = this.toQuery(params);
    return `${query}&vnp_SecureHash=${this.hmac(query, secret)}`;
  }

  private toQuery(params: StringMap) {
    return Object.keys(params)
      .sort()
      .map((key) => `${this.encode(key)}=${this.encode(params[key] ?? '')}`)
      .join('&');
  }

  private encode(value: string) {
    return encodeURIComponent(value).replace(/%20/g, '+');
  }

  private hmac(value: string, secret: string) {
    return createHmac('sha512', secret).update(value, 'utf8').digest('hex');
  }

  private credentials() {
    const tmnCode = this.config.get<string>('VNPAY_TMN_CODE')?.trim();
    const secret = this.config.get<string>('VNPAY_HASH_SECRET')?.trim();
    if (!tmnCode || !secret) {
      throw new ServiceUnavailableException(
        'VNPay chưa được cấu hình trên máy chủ',
      );
    }
    return { tmnCode, secret };
  }

  private serverIp() {
    return this.normalizeIp(
      this.config.get<string>('VNPAY_SERVER_IP', '127.0.0.1'),
    );
  }

  private normalizeIp(value: string) {
    const normalized = value
      .split(',')[0]
      ?.trim()
      .replace(/^::ffff:/, '');
    return normalized || '127.0.0.1';
  }

  private asString(value: unknown): string {
    if (Array.isArray(value)) {
      return value.length > 0 ? this.asString(value[0]) : '';
    }
    if (typeof value === 'string') return value;
    if (
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      typeof value === 'bigint'
    ) {
      return String(value);
    }
    return '';
  }

  private vnpStringParams(input: Record<string, unknown>, excluded: string[]) {
    const params: StringMap = {};
    for (const [key, value] of Object.entries(input)) {
      if (key.startsWith('vnp_') && !excluded.includes(key)) {
        params[key] = this.asString(value);
      }
    }
    return params;
  }

  private withoutSecureHash(raw: JsonMap) {
    const sanitized = { ...raw };
    delete sanitized.vnp_SecureHash;
    delete sanitized.vnp_SecureHashType;
    return sanitized;
  }
}
