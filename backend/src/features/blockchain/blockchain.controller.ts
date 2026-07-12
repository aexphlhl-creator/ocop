import { Controller, Get, NotFoundException, Param, Query, UseGuards , ParseUUIDPipe} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { BlockchainQueueService } from '../blockchain-queue/blockchain-queue.service';
import { BlockchainService } from './blockchain.service';
import { GetBlockchainRecordsQueryDto } from './dto/get-blockchain-records-query.dto';

@ApiTags('Blockchain')
@Controller('api/v1/blockchain')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleName.ADMIN)
@ApiBearerAuth()
export class BlockchainController {
  constructor(
    private readonly blockchainService: BlockchainService,
    private readonly blockchainQueueService: BlockchainQueueService,
  ) {}

  @Get('jobs')
  @ApiOperation({ summary: 'Danh sách BullMQ blockchain jobs theo trạng thái' })
  async getBlockchainJobs() {
    return this.blockchainQueueService.getJobs();
  }

  @Get('jobs/:id')
  @ApiOperation({ summary: 'Chi tiết BullMQ blockchain job' })
  async getBlockchainJob(@Param('id', ParseUUIDPipe) id: string) {
    const job = await this.blockchainQueueService.getJob(id);
    if (!job) {
      throw new NotFoundException('Không tìm thấy blockchain job');
    }

    return job;
  }

  @Get('dashboard')
  @ApiOperation({ summary: 'Dashboard giám sát blockchain toàn hệ thống' })
  async getBlockchainDashboard() {
    return this.blockchainService.getMonitoringDashboard();
  }

  @Get('records')
  @ApiOperation({ summary: 'Danh sách blockchain records có filter và phân trang' })
  async getBlockchainRecords(@Query() query: GetBlockchainRecordsQueryDto) {
    return this.blockchainService.findRecords(query);
  }

  @Get('records/:id')
  @ApiOperation({ summary: 'Chi tiết blockchain record' })
  async getBlockchainRecord(@Param('id', ParseUUIDPipe) id: string) {
    return this.blockchainService.findRecordById(id);
  }

  @Get(':productId')
  @ApiOperation({ summary: 'Lấy danh sách sổ cái Blockchain của sản phẩm' })
  @ApiResponse({ status: 200, description: 'Danh sách các block' })
  async getProductBlockchain(@Param('productId', ParseUUIDPipe) productId: string) {
    const blocks = await this.blockchainService.getBlockchainHistory(productId);
    return { data: blocks };
  }
}
