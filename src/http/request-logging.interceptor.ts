import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { catchError, Observable, tap, throwError } from 'rxjs';
import type { Request, Response } from 'express';

type RequestWithId = Request & { id?: string };

@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HttpRequest');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<RequestWithId>();
    const response = context.switchToHttp().getResponse<Response>();
    const startedAt = Date.now();
    const fields = {
      requestId: request.id,
      method: request.method,
      path: request.path,
    };

    return next.handle().pipe(
      tap(() =>
        this.logger.log(
          JSON.stringify({
            ...fields,
            statusCode: response.statusCode,
            durationMs: Date.now() - startedAt,
          }),
        ),
      ),
      catchError((error: unknown) => {
        this.logger.error(
          JSON.stringify({
            ...fields,
            statusCode:
              error instanceof HttpException
                ? error.getStatus()
                : response.statusCode,
            durationMs: Date.now() - startedAt,
            errorName: error instanceof Error ? error.name : 'UnknownError',
          }),
        );

        return throwError(() => error);
      }),
    );
  }
}
