import {
  Controller,
  Post,
  Delete,
  Body,
  Query,
  UseInterceptors,
  UploadedFile,
  UseGuards,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiConsumes,
  ApiBody,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { MediaService } from './media.service';
import { DeleteMediaDto } from './dto/delete-media.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RoleName } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequestUser } from '../auth/interfaces/jwt-payload.interface';

@ApiTags('Media')
@Controller('api/v1/media')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post('upload')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(
    RoleName.ADMIN,
    RoleName.SELLER,
    RoleName.WAREHOUSE_MANAGER,
    RoleName.QUALITY_ASSURANCE,
  )
  @ApiBearerAuth()
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024, files: 1 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary:
      'Tải ảnh lên hệ thống lưu trữ MinIO cho hồ sơ sản phẩm, kho và nguồn gốc',
  })
  @ApiQuery({
    name: 'folder',
    required: false,
    enum: [
      'products',
      'avatars',
      'news',
      'supply-chain',
      'shipments',
      'events',
    ],
    description: 'Thư mục phân vùng lưu trữ ảnh',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Tải lên ảnh thành công, trả về URL và objectName',
  })
  @ApiResponse({ status: 400, description: 'Không tìm thấy file tải lên' })
  @ApiResponse({ status: 413, description: 'File quá lớn (giới hạn 10MB)' })
  @ApiResponse({
    status: 415,
    description:
      'Định dạng file không được hỗ trợ (chỉ nhận jpg, jpeg, png, webp)',
  })
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Query('folder') folder: string = 'products',
    @CurrentUser() user: RequestUser,
  ) {
    return this.mediaService.uploadImage(file, folder, user);
  }

  @Delete()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleName.ADMIN, RoleName.SELLER)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Xóa tệp tin ảnh khỏi MinIO theo objectName (Chỉ dành cho SELLER hoặc ADMIN)',
  })
  @ApiResponse({ status: 200, description: 'Xóa tệp tin thành công' })
  @ApiResponse({
    status: 400,
    description: 'objectName không đúng hoặc không tồn tại',
  })
  async deleteFile(
    @Body() dto: DeleteMediaDto,
    @CurrentUser() user: RequestUser,
  ) {
    await this.mediaService.deleteImage(dto.objectName, user);
    return { message: 'Xóa ảnh thành công' };
  }
}
