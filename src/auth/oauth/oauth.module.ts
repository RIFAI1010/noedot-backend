import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule } from '@nestjs/config';
import { GoogleStrategy } from './strategies/google.strategy';
import { OAuthController } from './oauth.controller';
import { OAuthService } from './oauth.service';
import { PrismaModule } from '../../prisma/prisma.module';
import { JwtModule } from '@nestjs/jwt';
import oauthConfig from '../oauth.config';

@Module({
    imports: [
        PassportModule,
        ConfigModule.forFeature(oauthConfig),
        PrismaModule,
        JwtModule.registerAsync({
            useFactory: () => ({
                secret: process.env.JWT_SECRET,
                signOptions: { expiresIn: '15m' },
            }),
        }),
    ],
    controllers: [OAuthController],
    providers: [GoogleStrategy, OAuthService],
    exports: [OAuthService],
})
export class OAuthModule { }
