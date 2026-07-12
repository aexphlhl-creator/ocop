import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import * as qs from 'qs';
import { OrdersService } from '../orders/orders.service';
import { PaymentStatus } from '@prisma/client';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly ordersService: OrdersService,
  ) {}

  async createVnpayUrl(orderId: string, amount: number, ipAddr: string) {
    const tmnCode = this.configService.get<string>('VNPAY_TMN_CODE', 'DUMMYCODE');
    const secretKey = this.configService.get<string>('VNPAY_HASH_SECRET', 'DUMMYSECRET');
    const vnpUrl = this.configService.get<string>('VNPAY_URL', 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html');
    const returnUrl = this.configService.get<string>('VNPAY_RETURN_URL', 'http://localhost:3000/checkout/callback');

    const date = new Date();
    const createDate = this.formatDate(date);
    
    // VNPay format amount is amount * 100
    const vnp_Params: any = {
      vnp_Version: '2.1.0',
      vnp_Command: 'pay',
      vnp_TmnCode: tmnCode,
      vnp_Locale: 'vn',
      vnp_CurrCode: 'VND',
      vnp_TxnRef: orderId + '_' + date.getTime(),
      vnp_OrderInfo: 'Thanh toan don hang ' + orderId,
      vnp_OrderType: 'other',
      vnp_Amount: amount * 100,
      vnp_ReturnUrl: returnUrl,
      vnp_IpAddr: ipAddr,
      vnp_CreateDate: createDate,
    };

    const sortedParams = this.sortObject(vnp_Params);
    const signData = qs.stringify(sortedParams, { encode: false });
    const hmac = crypto.createHmac('sha512', secretKey);
    const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest('hex');
    sortedParams['vnp_SecureHash'] = signed;

    const paymentUrl = vnpUrl + '?' + qs.stringify(sortedParams, { encode: false });
    return { paymentUrl };
  }

  async verifyIpn(query: any) {
    const secureHash = query.vnp_SecureHash;
    delete query.vnp_SecureHash;
    delete query.vnp_SecureHashType;

    const secretKey = this.configService.get<string>('VNPAY_HASH_SECRET', 'DUMMYSECRET');
    const sortedParams = this.sortObject(query);
    const signData = qs.stringify(sortedParams, { encode: false });
    const hmac = crypto.createHmac('sha512', secretKey);
    const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest('hex');

    if (secureHash === signed) {
      const orderId = (query.vnp_TxnRef as string).split('_')[0];
      const rspCode = query.vnp_ResponseCode;

      try {
        const order = await this.ordersService.getOrderById(orderId);
        if (order) {
          if (order.paymentStatus === 'PENDING') {
            if (rspCode === '00') {
              // Success
              await this.ordersService.ordersRepository.updatePaymentStatus(orderId, PaymentStatus.COMPLETED, query.vnp_TransactionNo);
            } else {
              // Failed
              await this.ordersService.ordersRepository.updatePaymentStatus(orderId, PaymentStatus.FAILED, query.vnp_TransactionNo);
            }
            return { RspCode: '00', Message: 'Confirm Success' };
          } else {
            return { RspCode: '02', Message: 'Order already confirmed' };
          }
        } else {
          return { RspCode: '01', Message: 'Order not found' };
        }
      } catch (e) {
        this.logger.error(e);
        return { RspCode: '99', Message: 'Unknown error' };
      }
    } else {
      return { RspCode: '97', Message: 'Invalid Checksum' };
    }
  }

  async verifyReturn(query: any) {
    const secureHash = query.vnp_SecureHash;
    delete query.vnp_SecureHash;
    delete query.vnp_SecureHashType;

    const secretKey = this.configService.get<string>('VNPAY_HASH_SECRET', 'DUMMYSECRET');
    const sortedParams = this.sortObject(query);
    const signData = qs.stringify(sortedParams, { encode: false });
    const hmac = crypto.createHmac('sha512', secretKey);
    const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest('hex');

    if (secureHash === signed) {
      if (query.vnp_ResponseCode === '00') {
        return { success: true, message: 'Thanh toán thành công' };
      }
      return { success: false, message: 'Thanh toán thất bại hoặc bị hủy' };
    }
    
    return { success: false, message: 'Chữ ký không hợp lệ' };
  }

  private sortObject(obj: any) {
    const sorted: any = {};
    const str = [];
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        str.push(encodeURIComponent(key));
      }
    }
    str.sort();
    for (let key = 0; key < str.length; key++) {
      sorted[str[key]] = encodeURIComponent(obj[str[key]]).replace(/%20/g, '+');
    }
    return sorted;
  }

  private formatDate(date: Date) {
    const pad = (n: number) => n < 10 ? '0' + n : n;
    return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  }
}
