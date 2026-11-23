import { Module } from '@nestjs/common';
import { VouchersController } from './vouchers.controller';
import { VouchersService } from './vouchers.service';
import { VouchersRepository } from './vouchers.repository';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [VouchersController],
  providers: [VouchersService, VouchersRepository],
  exports: [VouchersService],
})
export class VouchersModule {}
