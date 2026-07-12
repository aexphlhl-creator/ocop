import { 
  Controller, Get, Post, Body, Patch, Param, Delete, Query, UseGuards 
} from '@nestjs/common';
import { EventsService } from './events.service';
import { CreateEventDto } from './dto/create-event.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { RoleName, EventStatus } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequestUser } from '../auth/interfaces/jwt-payload.interface';

@ApiTags('Events')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Post()
  @Roles(RoleName.ADMIN, RoleName.EVENT_COORDINATOR)
  @ApiOperation({ summary: 'Tạo sự kiện mới' })
  create(@Body() createEventDto: CreateEventDto, @CurrentUser() user: RequestUser) {
    return this.eventsService.create(createEventDto, user);
  }

  @Get()
  @Roles(RoleName.ADMIN, RoleName.EVENT_COORDINATOR)
  @ApiOperation({ summary: 'Lấy danh sách sự kiện' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'status', required: false, enum: EventStatus })
  findAll(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('search') search?: string,
    @Query('status') status?: EventStatus,
  ) {
    return this.eventsService.findAll(Number(page) || 1, Number(limit) || 10, search, status);
  }

  @Get(':id')
  @Roles(RoleName.ADMIN, RoleName.EVENT_COORDINATOR)
  @ApiOperation({ summary: 'Lấy chi tiết sự kiện' })
  findOne(@Param('id') id: string) {
    return this.eventsService.findOne(id);
  }

  @Patch(':id')
  @Roles(RoleName.ADMIN, RoleName.EVENT_COORDINATOR)
  @ApiOperation({ summary: 'Cập nhật sự kiện' })
  update(@Param('id') id: string, @Body() updateEventDto: UpdateEventDto, @CurrentUser() user: RequestUser) {
    return this.eventsService.update(id, updateEventDto, user);
  }

  @Patch(':id/publish')
  @Roles(RoleName.ADMIN, RoleName.EVENT_COORDINATOR)
  @ApiOperation({ summary: 'Publish sự kiện' })
  publish(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.eventsService.publish(id, user);
  }

  @Patch(':id/cancel')
  @Roles(RoleName.ADMIN, RoleName.EVENT_COORDINATOR)
  @ApiOperation({ summary: 'Hủy sự kiện' })
  cancel(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.eventsService.cancel(id, user);
  }

  @Patch(':id/ongoing')
  @Roles(RoleName.ADMIN, RoleName.EVENT_COORDINATOR)
  @ApiOperation({ summary: 'Chuyển sang trạng thái đang diễn ra' })
  markAsOngoing(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.eventsService.markAsOngoing(id, user);
  }

  @Patch(':id/complete')
  @Roles(RoleName.ADMIN, RoleName.EVENT_COORDINATOR)
  @ApiOperation({ summary: 'Hoàn thành sự kiện' })
  markAsCompleted(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.eventsService.markAsCompleted(id, user);
  }

  @Delete(':id')
  @Roles(RoleName.ADMIN, RoleName.EVENT_COORDINATOR)
  @ApiOperation({ summary: 'Xóa sự kiện (soft delete)' })
  remove(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.eventsService.remove(id, user);
  }
}
