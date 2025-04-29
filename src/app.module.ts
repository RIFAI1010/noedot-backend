import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UserService } from './user/user.service';
import { UserController } from './user/user.controller';
import { PrismaModule } from './prisma/prisma.module';
import { UserModule } from './user/user.module';
import { ConfigModule } from '@nestjs/config';
import { AuthController } from './auth/auth.controller';
import { AuthModule } from './auth/auth.module';
import { MailerModule } from '@nestjs-modules/mailer';
import { LoggerMiddleware } from './common/middlewares/logger.middleware';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { OAuthModule } from './auth/oauth/oauth.module';
import { OAuthController } from './auth/oauth/oauth.controller';
import { NoteModule } from './note/note.module';
import { TableModule } from './table/table.module';
import { DocumentModule } from './document/document.module';
import { DocumentController } from './document/document.controller';
import { TableController } from './table/table.controller';
import { NoteController } from './note/note.controller';
import { DebugModule } from './debug/debug.module';
import { DebugController } from './debug/debug.controller';
import { BoardModule } from './board/board.module';
import { BoardController } from './board/board.controller';

@Module({
  imports: [ConfigModule.forRoot(), PrismaModule, UserModule, AuthModule, OAuthModule, NoteModule, TableModule, DocumentModule, BoardModule, DebugModule],
  controllers: [AppController, AuthController, OAuthController, UserController, BoardController, DocumentController, TableController, NoteController, DebugController],
  providers: [AppService, UserService, {
    provide: APP_INTERCEPTOR,
    useClass: LoggingInterceptor,
  }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(LoggerMiddleware)
      .forRoutes({ path: '*', method: RequestMethod.ALL });
  }
}