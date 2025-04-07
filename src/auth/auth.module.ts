import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { MailModule } from '../mail/mail.module';
import { PrismaService } from 'src/prisma/prisma.service';
import { OAuthModule } from './oauth/oauth.module';
import { WebsocketModule } from 'src/websocket/websocket.module';
// import { JwtModule } from '@nestjs/jwt';

@Module({
  imports: [PrismaModule, MailModule, OAuthModule, WebsocketModule
    // JwtModule.registerAsync({
    //   useFactory: () => ({
    //     secret: process.env.JWT_SECRET,
    //     signOptions: { expiresIn: '15m' },
    //   }),
    // }),
  ],
  exports: [AuthService],
  providers: [AuthService, PrismaService],
  controllers: [AuthController],
})
export class AuthModule { }