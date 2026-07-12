import { Controller, Post, Get, Body, UseGuards, HttpCode, HttpStatus, Req } from '@nestjs/common';
import type { Request } from 'express';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { JwtRefreshAuthGuard } from './guards/jwt-refresh-auth.guard';
import { CurrentUser } from './decorators/current-user.decorator';
import { RequestUser, RequestRefreshUser } from './interfaces/jwt-payload.interface';

@ApiTags('Authentication')
@Controller('api/v1/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @UseGuards(ThrottlerGuard)
  @ApiOperation({ summary: 'Đăng ký tài khoản SELLER mới' })
  @ApiResponse({ status: 201, description: 'Đăng ký thành công, trả về thông tin user và cặp token' })
  @ApiResponse({ status: 400, description: 'Dữ liệu đầu vào không hợp lệ' })
  @ApiResponse({ status: 409, description: 'Email đã được sử dụng' })
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @UseGuards(ThrottlerGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Đăng nhập vào hệ thống bằng email và mật khẩu' })
  @ApiResponse({ status: 200, description: 'Đăng nhập thành công, trả về cặp token và user info' })
  @ApiResponse({ status: 401, description: 'Email hoặc mật khẩu không chính xác' })
  @ApiResponse({ status: 403, description: 'Tài khoản đã bị khóa' })
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('refresh')
  @UseGuards(ThrottlerGuard, JwtRefreshAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cấp lại Access Token mới bằng Refresh Token' })
  @ApiResponse({ status: 200, description: 'Cấp token mới thành công' })
  @ApiResponse({ status: 401, description: 'Refresh token không hợp lệ hoặc đã bị blacklist' })
  async refresh(@CurrentUser() user: RequestRefreshUser, @Body() dto: RefreshTokenDto) {
    // RefreshTokenDto được đưa vào body để Swagger tạo tài liệu mẫu và class-validator kiểm tra cú pháp,
    // nhưng việc xác thực thực tế đã được JwtRefreshAuthGuard đảm nhận và trả về qua user context.
    return this.authService.refresh(user.sub, user.email, user.role, user.refreshToken);
  }

  @Post('logout')
  @UseGuards(ThrottlerGuard, JwtRefreshAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Đăng xuất tài khoản, đưa refresh token hiện tại vào blacklist' })
  @ApiResponse({ status: 200, description: 'Đăng xuất thành công' })
  @ApiResponse({ status: 401, description: 'Refresh token không hợp lệ' })
  async logout(@CurrentUser() user: RequestRefreshUser, @Body() dto: RefreshTokenDto, @Req() req: Request) {
    const authHeader = req.headers.authorization;
    let accessToken: string | undefined;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      accessToken = authHeader.substring(7);
    }
    return this.authService.logout(user.refreshToken, accessToken);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Lấy thông tin tài khoản hiện tại từ Access Token' })
  @ApiResponse({ status: 200, description: 'Thông tin tài khoản hiện tại' })
  @ApiResponse({ status: 401, description: 'Token không hợp lệ hoặc hết hạn' })
  async getMe(@CurrentUser() user: RequestUser) {
    return user;
  }
}
