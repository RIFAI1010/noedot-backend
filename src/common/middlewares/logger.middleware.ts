import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import * as morgan from 'morgan';
import { createStream } from 'rotating-file-stream';
import { join } from 'path';
import * as fs from 'fs';

@Injectable()
export class LoggerMiddleware implements NestMiddleware {
    private logger: any;


    constructor() {
        // Membuat direktori logs jika belum ada
        const logDirectory = join(process.cwd(), 'logs');
        fs.existsSync(logDirectory) || fs.mkdirSync(logDirectory);

        // Membuat rotating write stream
        const accessLogStream = createStream('access.log', {
            interval: '1d', // Rotate daily
            path: logDirectory,
            size: '10M', // Rotate jika ukuran mencapai 10MB
            compress: 'gzip' // Compress rotated files
        });

        // Custom token untuk response time dalam ms
        morgan.token('response-time-ms', (_req: Request, res: Response): string => {
            if (!res.locals || !res.locals.startAt) return '';
            const ms = Date.now() - res.locals.startAt;
            return ms.toFixed(3);
        });

        // Custom format yang lebih detail
        const morganFormat = [
            '[:date[iso]]',
            ':remote-addr',
            ':method',
            ':url',
            'STATUS::status',
            'TIME::response-time-ms ms',
            'LENGTH::res[content-length]',
            'REFERRER::referrer',
            'USER-AGENT::user-agent'
        ].join(' | ');

        // Setup morgan
        this.logger = morgan(morganFormat, {
            stream: accessLogStream,
            skip: (_req, res) => process.env.NODE_ENV === 'test' // Skip logging in test
        });
    }

    use(req: Request, res: Response, next: NextFunction): void {
        return this.logger(req, res, next);
    }
}
