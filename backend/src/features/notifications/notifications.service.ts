import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MailerService } from '@nestjs-modules/mailer';
import { ConfigService } from '@nestjs/config';
import { NotificationType, RoleName } from '@prisma/client';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailerService: MailerService,
    private readonly configService: ConfigService,
  ) {}

  async createNotification(
    userId: string,
    title: string,
    message: string,
    type: NotificationType = 'INFO',
    link?: string,
  ) {
    return this.prisma.notification.create({
      data: {
        userId,
        title,
        message,
        type,
        link,
      },
    });
  }

  async sendEmail(to: string, subject: string, html: string) {
    if (this.configService.get<boolean>('DEMO_MODE', false)) {
      this.logger.log(
        `DEMO_MODE Email Suppressed: to=${to} subject=${subject}`,
      );
      return;
    }

    try {
      await this.mailerService.sendMail({
        to,
        subject,
        html,
      });
      this.logger.log(`Email sent to ${to}`);
    } catch (error) {
      this.logger.error(
        `Failed to send email to ${to}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  async notifyAdminsNewProduct(
    productName: string,
    sellerName: string,
    productId: string,
  ) {
    // 1. Lấy danh sách tất cả Admin
    const admins = await this.prisma.user.findMany({
      where: { role: { name: RoleName.ADMIN } },
    });

    const title = 'Sản phẩm mới chờ duyệt';
    const message = `Người bán "${sellerName}" vừa thêm sản phẩm mới "${productName}". Vui lòng kiểm tra và phê duyệt.`;
    const link = `/dashboard/products?productId=${encodeURIComponent(productId)}`;

    for (const admin of admins) {
      // Gửi in-app notification
      await this.createNotification(admin.id, title, message, 'INFO', link);

      // Gửi email
      const html = `
        <h3>Xin chào ${admin.fullName},</h3>
        <p>Một sản phẩm mới vừa được tạo trên hệ thống và đang chờ bạn phê duyệt.</p>
        <ul>
          <li><strong>Tên sản phẩm:</strong> ${productName}</li>
          <li><strong>Người bán:</strong> ${sellerName}</li>
        </ul>
        <p>Vui lòng đăng nhập vào trang quản trị để xem xét.</p>
      `;
      await this.sendEmail(
        admin.email,
        '[OCOP] Sản phẩm mới chờ phê duyệt',
        html,
      );
    }
  }

  async notifySellerProductStatus(
    userId: string,
    productName: string,
    isApproved: boolean,
    reason?: string,
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) return;

    const statusText = isApproved ? 'đã được PHÊ DUYỆT' : 'bị TỪ CHỐI';
    const type: NotificationType = isApproved ? 'SUCCESS' : 'ERROR';
    const title = `Sản phẩm ${statusText}`;
    const message = isApproved
      ? `Sản phẩm "${productName}" của bạn đã được Admin phê duyệt và hiển thị trên Cổng thông tin.`
      : `Sản phẩm "${productName}" của bạn đã bị từ chối.${reason ? ' Lý do: ' + reason : ''}`;

    // Gửi in-app notification
    await this.createNotification(
      user.id,
      title,
      message,
      type,
      '/dashboard/products',
    );

    // Gửi email
    const html = `
      <h3>Xin chào ${user.fullName},</h3>
      <p>Sản phẩm <strong>"${productName}"</strong> của bạn <strong>${statusText}</strong>.</p>
      ${!isApproved && reason ? `<p><strong>Lý do từ chối:</strong> ${reason}</p>` : ''}
      <p>Trân trọng,<br/>Ban quản trị OCOP</p>
    `;
    await this.sendEmail(
      user.email,
      `[OCOP] Thông báo trạng thái sản phẩm ${productName}`,
      html,
    );
  }

  async getMyNotifications(userId: string) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async getUnreadCount(userId: string) {
    return this.prisma.notification.count({
      where: { userId, isRead: false },
    });
  }

  async markAsRead(notificationId: string, userId: string) {
    const notif = await this.prisma.notification.findUnique({
      where: { id: notificationId },
    });
    if (!notif || notif.userId !== userId) {
      throw new Error('Not found or unauthorized');
    }
    return this.prisma.notification.update({
      where: { id: notificationId },
      data: { isRead: true },
    });
  }

  async markAllAsRead(userId: string) {
    return this.prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
  }
}
