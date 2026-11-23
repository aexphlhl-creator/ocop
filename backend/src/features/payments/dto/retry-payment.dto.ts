import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class RetryPaymentDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID('4')
  aggregateId: string;
}
