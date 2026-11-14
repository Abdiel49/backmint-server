import { HttpException } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { RequestLoggingInterceptor } from './request-logging.interceptor.js';

describe('RequestLoggingInterceptor', () => {
  it('logs request ID, route, response status and duration', () => {
    const interceptor = new RequestLoggingInterceptor();
    const log = vi.spyOn(
      (interceptor as unknown as { logger: { log: (message: string) => void } })
        .logger,
      'log',
    );
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          id: 'req-123',
          method: 'GET',
          path: '/api/health',
        }),
        getResponse: () => ({ statusCode: 200 }),
      }),
    };

    interceptor
      .intercept(
        context as never,
        { handle: () => of({ status: 'ok' }) } as never,
      )
      .subscribe();

    expect(JSON.parse(log.mock.calls[0][0])).toMatchObject({
      requestId: 'req-123',
      method: 'GET',
      path: '/api/health',
      statusCode: 200,
    });
  });

  it('logs an HTTP exception status without including the exception message', () => {
    const interceptor = new RequestLoggingInterceptor();
    const logger = (
      interceptor as unknown as {
        logger: { error: (message: string) => void };
      }
    ).logger;
    const errorLog = vi.spyOn(logger, 'error');
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({
          id: 'req-456',
          method: 'POST',
          path: '/api/resource',
        }),
        getResponse: () => ({ statusCode: 200 }),
      }),
    };

    interceptor
      .intercept(
        context as never,
        {
          handle: () =>
            throwError(() => new HttpException('sensitive detail', 403)),
        } as never,
      )
      .subscribe({ error: () => undefined });

    expect(JSON.parse(errorLog.mock.calls[0][0])).toMatchObject({
      requestId: 'req-456',
      statusCode: 403,
      errorName: 'HttpException',
    });
    expect(errorLog.mock.calls[0][0]).not.toContain('sensitive detail');
  });
});
