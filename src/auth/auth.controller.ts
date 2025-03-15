import { Controller, Post, Body, Req, Res, UnauthorizedException } from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { Auth } from 'src/common/decorators/user.decorator';
import { User } from '.prisma/client';
import { LoginDto } from './dto/login.dto';

@Controller('auth')
export class AuthController {
    constructor(private authService: AuthService) { }

    @Post('register')
    async register(@Body() dto: RegisterDto) {
        return this.authService.register(dto);
    }

    @Post('verify-email')

    async verifyEmail(@Body() dto: VerifyEmailDto) {
        return this.authService.verifyEmail(dto);
    }

    @Post('resend-verification')
    async resendVerification(@Body() dto: ResendVerificationDto) {
        return this.authService.resendVerificationCode(dto.email);
    }

    @Post('login')
    async login(@Body() data: LoginDto, @Res({ passthrough: true }) res: Response) {
        try {
            const { accessToken, refreshToken } = await this.authService.login(data);
            res.cookie('refreshToken', refreshToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production', // Use secure cookies in production
                sameSite: 'strict',
                maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
            });
            return { accessToken };
        } catch (error) {
            res.clearCookie('refreshToken');
            throw error;
        }
    }

    @Post('refresh')
    async refresh(@Req() req: Request) {
        const refreshToken = req.cookies['refreshToken'];
        if (!refreshToken) {
            throw new UnauthorizedException('Refresh token not found');
        }
        return this.authService.refresh(refreshToken);
    }

    @Post('logout')
    logout(@Auth() user: User, @Res({ passthrough: true }) res: Response) {
        res.clearCookie('refreshToken');
        return this.authService.logout(user);
    }
}
