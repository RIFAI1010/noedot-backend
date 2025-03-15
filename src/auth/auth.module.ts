import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { MailModule } from '../mail/mail.module';
import { PrismaService } from 'src/prisma/prisma.service';
import { OAuthModule } from './oauth/oauth.module';
import { JwtModule } from '@nestjs/jwt';
import { SECRET } from 'src/config';

@Module({
  imports: [PrismaModule, MailModule, OAuthModule, JwtModule.registerAsync({
    useFactory: () => ({
      secret: SECRET,
      signOptions: { expiresIn: '15m' },
    }),
  }),],
  exports: [AuthService],
  providers: [AuthService, PrismaService],
  controllers: [AuthController],
})
export class AuthModule {}