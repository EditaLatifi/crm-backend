import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { ActivityLoggerService } from './activity-logger.service';

@Injectable()
export class ActivityInterceptor implements NestInterceptor {
  constructor(private activityLogger: ActivityLoggerService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const user = req.user;
    const entityType = req.baseUrl?.split('/')[1];
    const entityId = req.params?.id;
    return next.handle().pipe(
      tap(async (result) => {
        if (['POST', 'PATCH', 'DELETE'].includes(req.method) && user && entityType && entityId) {
          await this.activityLogger.logActivity({
            actorUserId: user.userId,
            entityType,
            entityId,
            action: `${entityType}.${req.method.toLowerCase()}`,
            payloadJson: req.body || {},
          });
        }
      })
    );
  }
}
