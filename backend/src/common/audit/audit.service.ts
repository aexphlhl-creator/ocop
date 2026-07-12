import { Injectable, Logger } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';

export interface AuditEventParams {
  action: string;
  userId?: string;
  role?: string;
  businessId?: string;
  entity?: string;
  entityId?: string;
  ip?: string;
  userAgent?: string;
  result: 'SUCCESS' | 'FAILED';
  reason?: string;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger('AuditLog');

  constructor(private readonly cls: ClsService) {}

  logEvent(params: AuditEventParams) {
    const reqId = this.cls.get('reqId');
    
    // Ghi log định dạng chuẩn JSON cho ELK
    this.logger.log({
      type: 'AUDIT',
      timestamp: new Date().toISOString(),
      reqId,
      ...params,
    });
  }
}
