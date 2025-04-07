import { Controller, Post, Body, Req, Res, UnauthorizedException, Param, UseGuards, Query } from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { ForgotPasswordDto, LoginDto, RegisterDto, ResendVerificationDto, ResetPasswordDto, VerifyEmailDto } from './dto/auth.dto';
import { Auth } from 'src/common/decorators/user.decorator';
import { UserAccessType } from '../common/utils/jwt.util';
import { AuthMiddleware } from 'src/common/middlewares/auth.middleware';

@Controller('auth')
export class AuthController {
    constructor(private authService: AuthService) { }

    @Post('register')
    async register(@Body() data: RegisterDto) {
        return this.authService.register(data);
    }

    @Post('verify')
    async verifyEmail(
        @Body() { token, socketToken }: { token: string, socketToken: string }
    ) {
        return this.authService.verifyEmail(token, socketToken);
    }

    @Post('resend-verification')
    async resendVerification(
        @Body() data: ResendVerificationDto
    ) {
        return this.authService.resendVerificationLink(data);
    }

    @Post('user-status')
    async CheckUserStatus(
        @Body() data: { token: string }
    ) {
        return this.authService.checkUserStatus(data.token);
    }

    @Post('forgot-password')
    async ForgotPassword(
        @Body() data: ForgotPasswordDto
    ) {
        return this.authService.forgotPassword(data);
    }

    @Post('reset')
    async ResetPassword(
        @Body() data: ResetPasswordDto
    ) {
        return this.authService.resetPassword(data);
    }

    @Post('login-token')
    async LoginToken(
        @Req() req: Request,
        @Body() data: { token: string },
        @Res({ passthrough: true }) res: Response
    ) {
        try {
            const ipAddress = (req.headers['x-forwarded-for'] || req.ip) as string;
            const userAgent = (req.headers['user-agent'] || 'Unknown Device') as string;
            const location = (req.headers['x-forwarded-for'] || req.connection.remoteAddress) as string;
            const { accessToken, refreshToken, name, avatar } = await this.authService.loginToken(data.token, userAgent, ipAddress);
            res.cookie('refreshToken', refreshToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production', // Use secure cookies in production
                sameSite: 'strict',
                maxAge: 7 * 24 * 60 * 60 * 1000,
            });
            return { accessToken, name, avatar };
        } catch (error) {
            res.clearCookie('refreshToken');
            throw error;
        }
    }

    @Post('login')
    async login(
        @Req() req: Request,
        @Body() data: LoginDto,
        @Res({ passthrough: true }) res: Response
    ) {
        try {
            const ipAddress = (req.headers['x-forwarded-for'] || req.ip) as string;
            const userAgent = (req.headers['user-agent'] || 'Unknown Device') as string;
            const { message, accessToken, refreshToken, name, avatar } = await this.authService.login(data, userAgent, ipAddress);
            res.cookie('refreshToken', refreshToken, {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production', // Use secure cookies in production
                sameSite: 'strict',
                maxAge: 7 * 24 * 60 * 60 * 1000,
            });
            return { message, accessToken, name, avatar };
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
    async logout(
        @Res({ passthrough: true }) res: Response,
        @Req() req: Request,
        @Body() data: { all?: boolean },
        @Auth() user: UserAccessType
    ) {
        const refreshToken = req.cookies['refreshToken'];
        await this.authService.logout(user?.id, refreshToken, data?.all);
        res.clearCookie('refreshToken');
    }
}
