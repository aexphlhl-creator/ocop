import { Module } from '@nestjs/common';
import { UpgradesController } from './upgrades.controller';
import { UpgradesService } from './upgrades.service';
import { UpgradesRepository } from './upgrades.repository';
import { PrismaModule } from '../prisma/prisma.module';
import { ProductsModule } from '../products/products.module';

@Module({
  imports: [PrismaModule, ProductsModule],
  controllers: [UpgradesController],
  providers: [UpgradesService, UpgradesRepository],
  exports: [UpgradesService],
})
export class UpgradesModule {}
