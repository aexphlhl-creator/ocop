import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
  ParseUUIDPipe,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { RoleName } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { RequestUser } from '../auth/interfaces/jwt-payload.interface';
import { CertificatesService } from './certificates.service';
import { CreateCertificateDto } from './dto/create-certificate.dto';
import { GetCertificatesQueryDto } from './dto/get-certificates-query.dto';
import { UpdateCertificateDto } from './dto/update-certificate.dto';

@ApiTags('Certificates')
@Controller('api/v1/certificates')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleName.ADMIN, RoleName.SELLER)
@ApiBearerAuth()
export class CertificatesController {
  constructor(private readonly certificatesService: CertificatesService) {}

  @Get('types')
  @ApiOperation({ summary: 'Danh sách loại chứng nhận' })
  getTypes() {
    return this.certificatesService.getTypes();
  }

  @Get('stats')
  @ApiOperation({ summary: 'Dashboard thống kê chứng nhận' })
  getStats(@CurrentUser() user: RequestUser) {
    return this.certificatesService.getDashboardStats(user);
  }

  @Get('expiring')
  @ApiOperation({ summary: 'Danh sách chứng nhận sắp hết hạn' })
  findExpiring(
    @CurrentUser() user: RequestUser,
    @Query('days', new DefaultValuePipe(30), ParseIntPipe) days: number,
  ) {
    return this.certificatesService.findExpiring(days, user);
  }

  @Post('cleanup')
  @Roles(RoleName.ADMIN)
  @ApiOperation({
    summary: 'Dry-run cleanup các file thuộc chứng nhận đã xóa mềm',
  })
  cleanup(@CurrentUser() user: RequestUser) {
    return this.certificatesService.cleanup(user);
  }

  @Get('product/:productId')
  @ApiOperation({ summary: 'Danh sách chứng nhận theo Product' })
  findByProduct(
    @Param('productId', ParseUUIDPipe) productId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.certificatesService.findByProduct(productId, user);
  }

  @Get('batch/:batchId')
  @ApiOperation({ summary: 'Danh sách chứng nhận theo Batch' })
  findByBatch(
    @Param('batchId', ParseUUIDPipe) batchId: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.certificatesService.findByBatch(batchId, user);
  }

  @Get()
  @ApiOperation({ summary: 'Danh sách chứng nhận có phân trang và bộ lọc' })
  findAll(
    @Query() query: GetCertificatesQueryDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.certificatesService.findAll(query, user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết chứng nhận' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.certificatesService.findOne(id, user);
  }

  @Post()
  @UseInterceptors(
    FilesInterceptor('files', 10, {
      limits: { fileSize: 20 * 1024 * 1024, files: 10 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: CreateCertificateDto })
  @ApiOperation({ summary: 'Tạo chứng nhận mới kèm file metadata' })
  create(
    @Body() dto: CreateCertificateDto,
    @UploadedFiles() files: Express.Multer.File[] = [],
    @CurrentUser() user: RequestUser,
  ) {
    return this.certificatesService.create(dto, files, user);
  }

  @Patch(':id')
  @UseInterceptors(
    FilesInterceptor('files', 10, {
      limits: { fileSize: 20 * 1024 * 1024, files: 10 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: UpdateCertificateDto })
  @ApiOperation({
    summary: 'Cập nhật chứng nhận; upload lại file sẽ tính lại documentHash',
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCertificateDto,
    @UploadedFiles() files: Express.Multer.File[] = [],
    @CurrentUser() user: RequestUser,
  ) {
    return this.certificatesService.update(id, dto, files, user);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Xóa mềm chứng nhận, không hard delete' })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.certificatesService.remove(id, user);
  }
}
