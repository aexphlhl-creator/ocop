import { Module } from '@nestjs/common';
import { SupplierService } from './services/supplier.service';
import { SupplierController } from './controllers/supplier.controller';
import { PurchaseOrderService } from './services/purchase-order.service';
import { PurchaseOrderController } from './controllers/purchase-order.controller';
import { GoodsReceiptService } from './services/goods-receipt.service';
import { GoodsReceiptController } from './controllers/goods-receipt.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditModule } from '../../common/audit/audit.module';

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [
    SupplierController,
    PurchaseOrderController,
    GoodsReceiptController
  ],
  providers: [
    SupplierService,
    PurchaseOrderService,
    GoodsReceiptService
  ],
  exports: [
    SupplierService,
    PurchaseOrderService,
    GoodsReceiptService
  ],
})
export class ProcurementModule {}
