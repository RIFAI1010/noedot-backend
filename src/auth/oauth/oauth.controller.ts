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
    async googleAuthCallback(@Req() req, @Res({ passthrough: true }) res: Response) {
        const user = req.user;
        const { refreshToken } = await this.oauthService.generateTokens(user.id);

        // Set cookie untuk refresh token
        res.cookie('refreshToken', refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 hari
        }).redirect(`${process.env.FRONTEND_URL}/success`); // Redirect ke halaman sukses dengan access token

        // return {
        //     message: 'Login successful',
        // }
    }
}
