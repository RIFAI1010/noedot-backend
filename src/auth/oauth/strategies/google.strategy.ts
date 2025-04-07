import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Profile, Strategy } from 'passport-google-oauth20';
import { ConfigService } from '@nestjs/config';
import { OAuthService } from '../oauth.service';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
    constructor(
        private configService: ConfigService,
        private oauthService: OAuthService,
    ) {
        super({
            clientID: configService.get<string>('oauth.google.clientID'),
            clientSecret: configService.get<string>('oauth.google.clientSecret'),
            callbackURL: configService.get<string>('oauth.google.callbackURL'),
            scope: configService.get<string[]>('oauth.google.scope'),
        });
    }

    async validate(accessToken: string, refreshToken: string, profile: Profile) {
        const user = await this.oauthService.validateOAuthUser({
            provider: 'google',
            providerId: profile.id,
            email: profile.emails[0].value,
            name: profile.displayName,
            avatar: profile.photos[0].value,
            isVerified: true, // Anggap email sudah diverifikasi oleh Google
        });
        return user;
    }
}
