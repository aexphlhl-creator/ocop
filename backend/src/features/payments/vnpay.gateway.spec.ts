import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { createHmac } from 'crypto';
import { VnpayGateway } from './vnpay.gateway';

const SECRET = 'test-hash-secret';
const TMN_CODE = 'TESTCODE';

function hmac(value: string) {
  return createHmac('sha512', SECRET).update(value, 'utf8').digest('hex');
}

function config(overrides: Record<string, string | number> = {}) {
  const values: Record<string, string | number> = {
    VNPAY_TMN_CODE: TMN_CODE,
    VNPAY_HASH_SECRET: SECRET,
    VNPAY_URL: 'https://sandbox.example/pay',
    VNPAY_RETURN_URL: 'https://ocop.example/checkout/callback',
    VNPAY_API_URL: 'https://sandbox.example/transaction',
    VNPAY_SERVER_IP: '::ffff:127.0.0.1',
    VNPAY_API_TIMEOUT_MS: 5000,
    ...overrides,
  };
  const configValues = new Map(Object.entries(values));
  return {
    get: jest.fn(
      (key: string, fallback?: unknown) => configValues.get(key) ?? fallback,
    ),
  } as unknown as ConfigService;
}

function signedCallback(params: Record<string, string>) {
  const query = Object.entries(params)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(value).replace(
          /%20/g,
          '+',
        )}`,
    )
    .join('&');
  return { ...params, vnp_SecureHash: hmac(query) };
}

function apiResponse(overrides: Record<string, string> = {}) {
  const raw: Record<string, string> = {
    vnp_ResponseId: 'response-id',
    vnp_Command: 'querydr',
    vnp_ResponseCode: '00',
    vnp_Message: 'Success',
    vnp_TmnCode: TMN_CODE,
    vnp_TxnRef: 'txn-ref',
    vnp_Amount: '1234500',
    vnp_BankCode: 'NCB',
    vnp_PayDate: '20260821123000',
    vnp_TransactionNo: 'gateway-transaction',
    vnp_TransactionType: '01',
    vnp_TransactionStatus: '00',
    vnp_OrderInfo: 'Order',
    vnp_PromotionCode: '',
    vnp_PromotionAmount: '',
    ...overrides,
  };
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
  const responseValues = new Map(Object.entries(raw));
  raw.vnp_SecureHash = hmac(
    fields.map((field) => responseValues.get(field)).join('|'),
  );
  return raw;
}

describe('VnpayGateway', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('builds a signed payment URL using server amount and GMT+7 dates', () => {
    const gateway = new VnpayGateway(config());
    const result = gateway.buildPaymentUrl({
      txnRef: 'txn ref',
      amount: new Prisma.Decimal('12345.67'),
      ipAddress: '::ffff:10.0.0.1, 198.51.100.1',
      createDate: new Date('2026-08-21T01:02:03.000Z'),
      expiresAt: new Date('2026-08-21T01:17:03.000Z'),
    });

    const url = new URL(result.paymentUrl);
    expect(url.origin + url.pathname).toBe('https://sandbox.example/pay');
    expect(url.searchParams.get('vnp_Amount')).toBe('1234567');
    expect(url.searchParams.get('vnp_IpAddr')).toBe('10.0.0.1');
    expect(url.searchParams.get('vnp_CreateDate')).toBe('20260821080203');
    expect(url.searchParams.get('vnp_ExpireDate')).toBe('20260821081703');
    expect(result.gatewayCreateDate).toBe('20260821080203');

    const secureHash = url.searchParams.get('vnp_SecureHash');
    url.searchParams.delete('vnp_SecureHash');
    const encoded = Array.from(url.searchParams.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(
        ([key, value]) =>
          `${encodeURIComponent(key)}=${encodeURIComponent(value).replace(
            /%20/g,
            '+',
          )}`,
      )
      .join('&');
    expect(secureHash).toBe(hmac(encoded));
  });

  it('accepts an authentic callback and rejects a tampered callback', () => {
    const gateway = new VnpayGateway(config());
    const callback = signedCallback({
      vnp_TmnCode: TMN_CODE,
      vnp_TxnRef: 'txn-ref',
      vnp_Amount: '1234500',
      vnp_OrderInfo: 'Thanh toan OCOP',
      vnp_ResponseCode: '00',
      vnp_TransactionStatus: '00',
    });

    expect(gateway.verifyCallback(callback).valid).toBe(true);
    expect(
      gateway.verifyCallback({ ...callback, vnp_Amount: '99999900' }).valid,
    ).toBe(false);
    expect(
      gateway.verifyCallback({ ...callback, vnp_SecureHash: 'not-a-hash' })
        .valid,
    ).toBe(false);
  });

  it('uses the documented QUERYDR signature field order', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-21T01:02:03.000Z'));
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify(apiResponse()), { status: 200 }),
      );
    const gateway = new VnpayGateway(config());

    const result = await gateway.queryTransaction({
      requestId: 'request-id',
      txnRef: 'txn-ref',
      transactionDate: '20260821080000',
      transactionNo: 'gateway-transaction',
    });

    const requestBody = fetchMock.mock.calls[0][1]?.body;
    if (typeof requestBody !== 'string') {
      throw new Error('Expected a JSON string request body');
    }
    const body = JSON.parse(requestBody) as Record<string, string>;
    const expected = [
      'request-id',
      '2.1.0',
      'querydr',
      TMN_CODE,
      'txn-ref',
      '20260821080000',
      '20260821080203',
      '127.0.0.1',
      'Truy van giao dich txn-ref',
    ].join('|');
    expect(body.vnp_SecureHash).toBe(hmac(expected));
    expect(body.vnp_TransactionNo).toBe('gateway-transaction');
    expect(result.signatureValid).toBe(true);
    expect(result.paid).toBe(true);
    expect(result.raw).not.toHaveProperty('vnp_SecureHash');
  });

  it('uses the documented refund signature field order and amount x100', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-08-21T01:02:03.000Z'));
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify(
          apiResponse({
            vnp_Command: 'refund',
            vnp_TransactionType: '02',
          }),
        ),
        { status: 200 },
      ),
    );
    const gateway = new VnpayGateway(config());

    await gateway.refund({
      requestId: 'refund-request',
      txnRef: 'txn-ref',
      transactionDate: '20260821080000',
      transactionNo: 'gateway-transaction',
      amount: new Prisma.Decimal('12345'),
      transactionType: '02',
      createdBy: 'OCOP_SYSTEM',
    });

    const requestBody = fetchMock.mock.calls[0][1]?.body;
    if (typeof requestBody !== 'string') {
      throw new Error('Expected a JSON string request body');
    }
    const body = JSON.parse(requestBody) as Record<string, string>;
    const expected = [
      'refund-request',
      '2.1.0',
      'refund',
      TMN_CODE,
      '02',
      'txn-ref',
      '1234500',
      'gateway-transaction',
      '20260821080000',
      'OCOP_SYSTEM',
      '20260821080203',
      '127.0.0.1',
      'Hoan tien giao dich txn-ref',
    ].join('|');
    expect(body.vnp_Amount).toBe('1234500');
    expect(body.vnp_SecureHash).toBe(hmac(expected));
  });

  it('removes signatures and ignores non-VNPay fields in stored payloads', () => {
    const gateway = new VnpayGateway(config());
    expect(
      gateway.sanitizePayload({
        vnp_TxnRef: 'txn-ref',
        vnp_SecureHash: 'secret-signature',
        password: 'must-not-be-stored',
      }),
    ).toEqual({ vnp_TxnRef: 'txn-ref' });
  });

  it('fails closed when merchant credentials are missing', () => {
    const gateway = new VnpayGateway(
      config({ VNPAY_TMN_CODE: '', VNPAY_HASH_SECRET: '' }),
    );
    expect(() =>
      gateway.buildPaymentUrl({
        txnRef: 'txn-ref',
        amount: new Prisma.Decimal(5000),
        ipAddress: '127.0.0.1',
        createDate: new Date(),
        expiresAt: new Date(),
      }),
    ).toThrow(ServiceUnavailableException);
  });
});
