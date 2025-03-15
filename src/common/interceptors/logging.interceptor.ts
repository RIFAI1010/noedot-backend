import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Logger } from '@nestjs/common';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
    private readonly logger = new Logger(LoggingInterceptor.name);

    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
        const req = context.switchToHttp().getRequest();
        const method = req.method;
        const url = req.url;
        const now = Date.now();

        return next.handle().pipe(
            tap({
                next: (data) => {
                    const response = context.switchToHttp().getResponse();
                    this.logger.log(
                        `${method} ${url} ${response.statusCode} - ${Date.now() - now}ms\n` +
                        `Request Body: ${JSON.stringify(req.body)}\n` +
                        `Response: ${JSON.stringify(data)}`
                    );
                },
                error: (error) => {
                    this.logger.error(
                        `${method} ${url} - ${Date.now() - now}ms\n` +
                        `Request Body: ${JSON.stringify(req.body)}\n` +
                        `Error: ${error.message}\n` +
                        `Stack: ${error.stack}`
                    );
                },
            }),
        );
    }
}
