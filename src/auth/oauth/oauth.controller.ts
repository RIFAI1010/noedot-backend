import { Controller, Get, Req, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Response } from 'express';
import { OAuthService } from './oauth.service';

@Controller('auth')
export class OAuthController {
    constructor(private oauthService: OAuthService) { }

    @Get('google')
    @UseGuards(AuthGuard('google'))
    googleAuth() {
        // Inisiasi autentikasi
    }

    @Get('google/callback')
    @UseGuards(AuthGuard('google'))
    async googleAuthCallback(@Req() req, @Res() res: Response) {
        const user = req.user;
        const ipAddress = (req.headers['x-forwarded-for'] || req.ip) as string;
        const userAgent = (req.headers['user-agent'] || 'Unknown Device') as string;
        const { refreshToken, accessToken, name, avatar } = await this.oauthService.generateTokens(user.id, userAgent, ipAddress);
        // const accessToken = 'tes';
        // Set cookie untuk refresh token
        res.cookie('refreshToken', refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 hari
        })
        // .redirect(`${process.env.FRONTEND_URL}/success`);

        // Kirim skrip untuk mengirimkan token ke parent window
        .send(`
        <script>
            window.opener.postMessage({ token: "${accessToken}", name: "${name}", avatar: "${avatar}" }, "${process.env.FRONTEND_URL}");
            window.close();
        </script>`);
    }

}
