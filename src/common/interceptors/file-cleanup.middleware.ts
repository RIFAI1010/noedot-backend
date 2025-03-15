import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { unlink } from 'fs/promises';
import { join } from 'path';

@Injectable()
export class FileCleanupInterceptor implements NestInterceptor {
    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
        const request = context.switchToHttp().getRequest();
        const files: Express.Multer.File[] = request.files;
        // console.log('Files in interceptor:', files);
        return next.handle().pipe(
            tap(() => {
                // console.log('Request successful, keeping files');
            }),
            catchError(error => {
                // console.log('Error occurred, cleaning up files:', error);
                if (files && Array.isArray(files)) {
                    files.forEach(async (file) => {
                        try {
                            const filePath = join(process.cwd(), file.path);
                            // console.log('Deleting file:', filePath);
                            await unlink(filePath);
                        } catch (err) {
                            // console.error('Error deleting file:', err);
                        }
                    });
                }
                return throwError(() => error);
            })
        );
    }
}