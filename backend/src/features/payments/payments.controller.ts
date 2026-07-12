import { Controller, Post, Get, Body, Req, Query, Res, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PaymentsService } from './payments.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Payments')
@Controller('api/v1/payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('create-url')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Tạo URL thanh toán VNPay' })
  async createVnpayUrl(@Body() body: { orderId: string; amount: number }, @Req() req: any) {
    // Basic IP detection
    const ipAddr = req.headers['x-forwarded-for'] ||
      req.connection.remoteAddress ||
      req.socket.remoteAddress ||
      req.connection.socket.remoteAddress || '127.0.0.1';
    
    return this.paymentsService.createVnpayUrl(body.orderId, body.amount, ipAddr);
  }

  @Get('vnpay-ipn')
  @ApiOperation({ summary: 'VNPay IPN Webhook (Server-to-Server)' })
  async vnpayIpn(@Query() query: any) {
    return this.paymentsService.verifyIpn(query);
  }

  @Get('vnpay-return')
  @ApiOperation({ summary: 'VNPay Return (Xác thực kết quả cho Frontend)' })
  async vnpayReturn(@Query() query: any) {
    return this.paymentsService.verifyReturn(query);
  }
}
