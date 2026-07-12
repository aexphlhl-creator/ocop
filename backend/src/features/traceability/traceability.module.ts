import { Module } from '@nestjs/common';
import { CertificatesModule } from '../certificates/certificates.module';
import { PrismaModule } from '../prisma/prisma.module';
import { TraceabilityController } from './traceability.controller';
import { TraceabilityService } from './traceability.service';

@Module({
  imports: [PrismaModule, CertificatesModule],
  controllers: [TraceabilityController],
  providers: [TraceabilityService],
  exports: [TraceabilityService],
})
export class TraceabilityModule {}
