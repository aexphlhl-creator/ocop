import { Module } from '@nestjs/common';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { PrismaModule } from '../prisma/prisma.module';
import { VnpayGateway } from './vnpay.gateway';
import { InventoryReservationService } from '../orders/inventory-reservation.service';
import { PaymentMaintenanceService } from './payment-maintenance.service';

@Module({
  imports: [PrismaModule],
  controllers: [PaymentsController],
  providers: [
    PaymentsService,
    VnpayGateway,
    InventoryReservationService,
    PaymentMaintenanceService,
  ],
})
export class PaymentsModule {}
