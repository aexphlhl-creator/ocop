import {
  Body,
  Controller,
  Headers,
  Param,
  Post,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { createHash, createHmac, timingSafeEqual } from 'crypto';
import type { Request } from 'express';
import { CarrierWebhookDto } from './dto/carrier-webhook.dto';
import { ShipmentsService } from './shipments.service';

@ApiTags('Carrier Webhooks')
@Controller('api/v1/shipments/webhooks')
@UseGuards(ThrottlerGuard)
export class CarrierWebhooksController {
  constructor(
    private readonly shipmentsService: ShipmentsService,
    private readonly config: ConfigService,
  ) {}

  @Post(':providerCode')
  @ApiOperation({
    summary: 'Webhook chuẩn hóa có chữ ký HMAC từ adapter nhà vận chuyển',
  })
  handle(
    @Param('providerCode') providerCode: string,
    @Headers('x-carrier-signature') signature: string | undefined,
    @Body() dto: CarrierWebhookDto,
    @Req() request: RawBodyRequest<Request>,
  ) {
    const normalizedProvider = providerCode.trim().toUpperCase();
    const secret = this.secretFor(normalizedProvider);
    if (!secret) {
      throw new ServiceUnavailableException(
        'Nhà vận chuyển chưa cấu hình webhook',
      );
    }
    if (!request.rawBody || !signature) {
      throw new UnauthorizedException('Thiếu chữ ký webhook');
    }
    const providedHex = signature.replace(/^sha256=/i, '').trim();
    const expected = Buffer.from(
      createHmac('sha256', secret).update(request.rawBody).digest('hex'),
      'hex',
    );
    let provided: Buffer;
    try {
      provided = Buffer.from(providedHex, 'hex');
    } catch {
      throw new UnauthorizedException('Chữ ký webhook không hợp lệ');
    }
    if (
      provided.length !== expected.length ||
      !timingSafeEqual(provided, expected)
    ) {
      throw new UnauthorizedException('Chữ ký webhook không hợp lệ');
    }
    const payloadHash = createHash('sha256')
      .update(request.rawBody)
      .digest('hex');
    return this.shipmentsService.processCarrierWebhook(
      normalizedProvider,
      dto,
      payloadHash,
    );
  }

  private secretFor(providerCode: string) {
    const raw = this.config.get<string>('CARRIER_WEBHOOK_SECRETS');
    if (!raw) return undefined;
    try {
      const values = JSON.parse(raw) as Record<string, unknown>;
      const secret = values[providerCode];
      return typeof secret === 'string' && secret.length >= 32
        ? secret
        : undefined;
    } catch {
      return undefined;
    }
  }
}
