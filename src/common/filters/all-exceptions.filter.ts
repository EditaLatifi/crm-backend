import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

/**
 * Global exception filter. Turns Prisma errors and uncaught errors into proper HTTP
 * responses instead of generic 500s, and preserves NestJS HttpExceptions as-is.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse();
    const req = ctx.getRequest();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';

    if (exception instanceof HttpException) {
      // Pass through controller/service HttpExceptions untouched.
      status = exception.getStatus();
      const body = exception.getResponse();
      message = typeof body === 'string' ? body : (body as any).message ?? body;
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      switch (exception.code) {
        case 'P2025': // record not found (update/delete on missing row)
          status = HttpStatus.NOT_FOUND;
          message = 'Datensatz nicht gefunden';
          break;
        case 'P2002': // unique constraint
          status = HttpStatus.CONFLICT;
          message = 'Ein Datensatz mit diesen Werten existiert bereits';
          break;
        case 'P2003': // foreign key constraint
          status = HttpStatus.BAD_REQUEST;
          message = 'Ungültige Referenz (verknüpfter Datensatz existiert nicht)';
          break;
        default:
          status = HttpStatus.BAD_REQUEST;
          message = 'Datenbankanfrage fehlgeschlagen';
      }
    } else if (exception instanceof Prisma.PrismaClientValidationError) {
      status = HttpStatus.BAD_REQUEST;
      message = 'Ungültige Eingabedaten';
    } else if (
      exception &&
      typeof exception === 'object' &&
      typeof (exception as any).statusCode === 'number'
    ) {
      // Plain error objects from the legacy error.response helpers (forbidden()/notFound()).
      status = (exception as any).statusCode;
      message = (exception as any).message ?? message;
    } else if (exception instanceof Error) {
      // Unexpected error — keep 500 but surface the message instead of swallowing it.
      message = exception.message || message;
    }

    if (status >= 500) {
      this.logger.error(`${req?.method} ${req?.url} → ${status}: ${message}`,
        exception instanceof Error ? exception.stack : undefined);
    }

    res.status(status).json({
      statusCode: status,
      message,
      path: req?.url,
    });
  }
}
