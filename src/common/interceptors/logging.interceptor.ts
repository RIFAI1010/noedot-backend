import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Logger } from '@nestjs/common';
import * as fs from 'fs';
import { join } from 'path';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
    private readonly logger = new Logger(LoggingInterceptor.name);
    private readonly errorLogPath = join(process.cwd(), 'logs', 'error.log');

    constructor() {
        // Membuat direktori logs jika belum ada
        const logDirectory = join(process.cwd(), 'logs');
        fs.existsSync(logDirectory) || fs.mkdirSync(logDirectory);
    }

    private writeErrorToFile(error: any, context: ExecutionContext) {
        const req = context.switchToHttp().getRequest();
        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp,
            method: req.method,
            url: req.url,
            statusCode: 500,
            error: {
                message: error.message,
                stack: error.stack,
                name: error.name
            },
            request: {
                body: req.body,
                headers: req.headers,
                query: req.query,
                params: req.params
            }
        };

        fs.appendFileSync(this.errorLogPath, JSON.stringify(logEntry) + '\n');
    }

    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
        const req = context.switchToHttp().getRequest();
        const method = req.method;
        const url = req.url;
        const now = Date.now();

        return next.handle().pipe(
            tap({
                next: (data) => {
                    const response = context.switchToHttp().getResponse();
                    const duration = Date.now() - now;
                    
                    this.logger.log(
                        `[${new Date().toISOString()}] ${method} ${url} ${response.statusCode} - ${duration}ms\n` +
                        `Request Body: ${JSON.stringify(req.body)}\n` +
                        `Response: ${JSON.stringify(data)}` +
                        `Headers: ${JSON.stringify(req.headers)}` +
                        `Query: ${JSON.stringify(req.query)}` +
                        `Params: ${JSON.stringify(req.params)}`
                    );
                },
                error: (error) => {
                    const duration = Date.now() - now;
                    const statusCode = error.status || 500;
                    
                    if (statusCode >= 500) {
                        this.writeErrorToFile(error, context);
                    }

                    this.logger.error(
                        `[${new Date().toISOString()}] ${method} ${url} ${statusCode} - ${duration}ms\n` +
                        `Request Body: ${JSON.stringify(req.body)}\n` +
                        `Error: ${error.message}\n` +
                        `Stack: ${error.stack}\n` +
                        `Headers: ${JSON.stringify(req.headers)}\n` +
                        `Query: ${JSON.stringify(req.query)}\n` +
                        `Params: ${JSON.stringify(req.params)}`
                    );
                },
            }),
        );
    }
}
