import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
} from '@nestjs/common';
import { EventsService } from './events.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RoleName, EventStatus } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequestUser } from '../auth/interfaces/jwt-payload.interface';

@ApiTags('Events')
@Controller('api/v1/events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleName.ADMIN, RoleName.EVENT_COORDINATOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Tạo sự kiện mới' })
  create(
    @Body() createEventDto: CreateEventDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.eventsService.create(createEventDto, user);
  }

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Lấy danh sách sự kiện (Công cộng / Dashboard)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'status', required: false, enum: EventStatus })
  findAll(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
    @Query('status') status?: EventStatus,
    @CurrentUser() user?: RequestUser,
  ) {
    return this.eventsService.findAll(
      Number(page) || 1,
      Number(limit) || 10,
      search,
      status,
      user,
    );
  }

  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({ summary: 'Lấy chi tiết sự kiện' })
  findOne(@Param('id') id: string, @CurrentUser() user?: RequestUser) {
    return this.eventsService.findOne(id, user);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleName.ADMIN, RoleName.EVENT_COORDINATOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cập nhật sự kiện' })
  update(
    @Param('id') id: string,
    @Body() updateEventDto: UpdateEventDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.eventsService.update(id, updateEventDto, user);
  }

  @Patch(':id/publish')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleName.ADMIN, RoleName.EVENT_COORDINATOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Publish sự kiện' })
  publish(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.eventsService.publish(id, user);
  }

  @Patch(':id/cancel')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleName.ADMIN, RoleName.EVENT_COORDINATOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Hủy sự kiện' })
  cancel(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.eventsService.cancel(id, user);
  }

  @Patch(':id/ongoing')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleName.ADMIN, RoleName.EVENT_COORDINATOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Chuyển sang trạng thái đang diễn ra' })
  markAsOngoing(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.eventsService.markAsOngoing(id, user);
  }

  @Patch(':id/complete')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleName.ADMIN, RoleName.EVENT_COORDINATOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Hoàn thành sự kiện' })
  markAsCompleted(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.eventsService.markAsCompleted(id, user);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleName.ADMIN, RoleName.EVENT_COORDINATOR)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Xóa sự kiện (soft delete)' })
  remove(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.eventsService.remove(id, user);
  }
}
