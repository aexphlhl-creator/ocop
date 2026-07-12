import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { AuditService } from './audit.service';
import { Request } from 'express';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly auditService: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest<Request>();
    const { method, originalUrl, ip, headers } = req;
    const user = (req as any).user;
    
    // Chỉ audit các request thay đổi trạng thái hoặc auth
    if (method === 'GET' && !originalUrl.includes('/auth/')) {
      return next.handle();
    }

    const eventName = this.mapRouteToEvent(method, originalUrl, req.body);
    if (!eventName) return next.handle();

    return next.handle().pipe(
      tap(() => {
        this.auditService.logEvent({
          action: eventName,
          userId: user?.id,
          role: user?.role,
          businessId: user?.businessId,
          entity: this.extractEntity(originalUrl),
          entityId: req.params?.id ? String(req.params.id) : (req.params?.productId ? String(req.params.productId) : (req.params?.batchId ? String(req.params.batchId) : undefined)),
          ip,
          userAgent: headers['user-agent'],
          result: 'SUCCESS',
        });
      }),
      catchError((error) => {
        this.auditService.logEvent({
          action: eventName,
          userId: user?.id,
          role: user?.role,
          businessId: user?.businessId,
          entity: this.extractEntity(originalUrl),
          entityId: req.params?.id ? String(req.params.id) : (req.params?.productId ? String(req.params.productId) : (req.params?.batchId ? String(req.params.batchId) : undefined)),
          ip,
          userAgent: headers['user-agent'],
          result: 'FAILED',
          reason: error.message,
        });
        throw error;
      }),
    );
  }

  private mapRouteToEvent(method: string, url: string, body: any): string | null {
    if (url.includes('/auth/login')) return 'LOGIN_ATTEMPT'; // will be success/failed based on tap/catch
    if (url.includes('/auth/logout')) return 'LOGOUT';
    if (url.includes('/auth/refresh')) return 'TOKEN_REFRESH';
    
    if (url.includes('/businesses')) {
      if (method === 'POST') return 'BUSINESS_CREATED';
      if (method === 'PATCH') return 'BUSINESS_UPDATED';
      if (method === 'DELETE') return 'BUSINESS_DELETED';
    }

    if (url.includes('/products')) {
      if (url.endsWith('/approve')) return 'PRODUCT_APPROVED';
      if (method === 'POST') return 'PRODUCT_CREATED';
      if (method === 'PATCH') return 'PRODUCT_UPDATED';
      if (method === 'DELETE') return 'PRODUCT_DELETED';
    }

    if (url.includes('/inventory/in')) return 'INVENTORY_STOCK_IN';
    if (url.includes('/inventory/out')) return 'INVENTORY_STOCK_OUT';
    if (url.includes('/inventory/transfer')) return 'INVENTORY_TRANSFER';
    if (url.includes('/inventory/adjust')) return 'INVENTORY_ADJUST';

    if (url.includes('/orders')) {
      if (method === 'POST') return 'ORDER_CREATED';
      if (url.endsWith('/status')) {
         if (body?.status === 'CANCELLED') return 'ORDER_CANCELLED';
         if (body?.status === 'REFUNDED') return 'ORDER_REFUNDED';
         return 'ORDER_STATUS_UPDATED';
      }
    }

    if (url.includes('/certificates')) {
      if (method === 'POST') return 'CERTIFICATE_UPLOADED';
      if (method === 'PATCH') return 'CERTIFICATE_APPROVED';
      if (method === 'DELETE') return 'CERTIFICATE_DELETED';
    }

    if (url.includes('/supply-chain')) {
      if (url.includes('/journey')) return 'JOURNEY_ADDED';
    }

    return null;
  }

  private extractEntity(url: string): string {
    if (url.includes('/businesses')) return 'BUSINESS';
    if (url.includes('/products')) return 'PRODUCT';
    if (url.includes('/inventory')) return 'INVENTORY';
    if (url.includes('/orders')) return 'ORDER';
    if (url.includes('/certificates')) return 'CERTIFICATE';
    if (url.includes('/supply-chain')) return 'TRACEABILITY';
    return 'UNKNOWN';
  }
}
