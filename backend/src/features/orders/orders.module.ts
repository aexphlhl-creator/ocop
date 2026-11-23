import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { OrdersRepository } from './orders.repository';
import { PrismaModule } from '../prisma/prisma.module';
import { ProductsModule } from '../products/products.module';
import { VouchersModule } from '../vouchers/vouchers.module';
import { SupplyChainModule } from '../supply-chain/supply-chain.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { CheckoutService } from './checkout.service';
import { InventoryReservationService } from './inventory-reservation.service';
import { VnpayGateway } from '../payments/vnpay.gateway';

@Module({
  imports: [
    PrismaModule,
    ProductsModule,
    VouchersModule,
    SupplyChainModule,
    NotificationsModule,
  ],
  controllers: [OrdersController],
  providers: [
    OrdersService,
    OrdersRepository,
    CheckoutService,
    InventoryReservationService,
    VnpayGateway,
  ],
  exports: [OrdersService, InventoryReservationService],
})
export class OrdersModule {}
