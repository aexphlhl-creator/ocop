import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { TraceabilityService } from './traceability.service';

@ApiTags('Traceability')
@Controller('api/v1/traceability')
export class TraceabilityController {
  constructor(private readonly traceabilityService: TraceabilityService) {}

  @Get('batch/:batchId')
  @ApiOperation({
    summary: 'Truy xuất production theo đúng một batch/lot',
  })
  getBatchTraceability(@Param('batchId', ParseUUIDPipe) batchId: string) {
    return this.traceabilityService.getBatchTraceability(batchId);
  }

  @Get(':productId')
  @ApiOperation({
    summary: 'Aggregation endpoint chuẩn bị cho QR Traceability 2.0',
  })
  getProductTraceability(@Param('productId', ParseUUIDPipe) productId: string) {
    return this.traceabilityService.getProductTraceability(productId);
  }
}
