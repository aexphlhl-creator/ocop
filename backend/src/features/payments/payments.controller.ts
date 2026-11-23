import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  UseGuards,
  GoneException,
  Param,
  ParseUUIDPipe,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequestUser } from '../auth/interfaces/jwt-payload.interface';
import { RetryPaymentDto } from './dto/retry-payment.dto';
import { PaymentsService } from './payments.service';

@ApiTags('Payments')
@Controller('api/v1/payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('create-url')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Endpoint cũ đã ngừng hoạt động' })
  createVnpayUrl() {
    throw new GoneException(
      'URL VNPay chỉ được tạo bởi POST /api/v1/orders/checkout',
    );
  }

  @Post('retry')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Tạo lại phiên VNPay an toàn cho checkout' })
  retry(
    @Body() dto: RetryPaymentDto,
    @CurrentUser() user: RequestUser,
    @Req() request: Request,
  ) {
    return this.paymentsService.retryPayment(
      dto.aggregateId,
      user,
      this.clientIp(request),
    );
  }

  @Get('aggregates/:id/status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Trạng thái checkout/payment từ database' })
  getAggregateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.paymentsService.getAggregateStatus(id, user);
  }

  @Get('transactions/:txnRef/status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Trạng thái payment theo VNPay txnRef' })
  getTransactionStatus(
    @Param('txnRef') txnRef: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.paymentsService.getTransactionStatus(txnRef, user);
  }

  @Get('vnpay-ipn')
  @ApiOperation({ summary: 'VNPay IPN server-to-server' })
  vnpayIpn(@Query() query: Record<string, unknown>) {
    return this.paymentsService.verifyIpn(query);
  }

  @Get('vnpay-return')
  @ApiOperation({
    summary: 'Xác thực chữ ký Return URL; không cập nhật payment state',
  })
  vnpayReturn(@Query() query: Record<string, unknown>) {
    return this.paymentsService.verifyReturn(query);
  }

  private clientIp(request: Request) {
    return (
      (request.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      request.socket?.remoteAddress ||
      '127.0.0.1'
    );
  }
}
