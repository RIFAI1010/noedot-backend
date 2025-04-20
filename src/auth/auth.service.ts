import { Injectable, BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { MailService } from 'src/mail/mail.service';
import * as bcrypt from 'bcrypt';
import { generateAccessToken, generateLoginToken, generateRefreshToken, generateResetToken, generateVerifySocketToken, generateVeriifyToken, UserRefreshType, UserVerifyType } from '../common/utils/jwt.util';
import * as jwt from 'jsonwebtoken';
import { REFRESH_SECRET, RESET_SECRET, VERIFY_LOGIN_SECRET, VERIFY_SECRET, VERIFY_SOCKET_SECRET } from 'src/config';
import { VerificationGateway } from 'src/websocket/verification.gateway';
import { ForgotPasswordDto, LoginDto, RegisterDto, ResendVerificationDto, ResetPasswordDto, VerifyEmailDto } from './dto/auth.dto';



@Injectable()
export class AuthService {
    constructor(
        private prisma: PrismaService,
        private mailService: MailService,
        private verificationGateway: VerificationGateway,

    ) { }

    async register(data: RegisterDto) {
        const { email, password, name } = data;
        const existingUser = await this.prisma.user.findFirst({
            where: { email, isVerified: true, provider: null },
        });
        if (existingUser) {
            throw new ConflictException('Email is already taken');
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        try {
            return await this.prisma.$transaction(async (prisma) => {
                const user = await prisma.user.create({
                    data: {
                        email,
                        password: hashedPassword,
                        name,
                        lastResendAt: new Date(),
                    },
                });
                const payload = { id: user.id };
                const verificationToken = generateVeriifyToken(payload);
                const verificationSocketToken = generateVerifySocketToken(payload);
                await this.mailService.sendVerificationEmail(email, name, verificationToken, verificationSocketToken);
                return {
                    message: 'Registration successful. Please check your email.',
                    verificationSocketToken
                };
            });
        } catch (error) {
            throw new Error(`Error registering user: ${error.message}`);
        }
    }

    async resendVerificationLink(data: ResendVerificationDto) {
        try {
            const token = data.resendToken;
            const decode = jwt.verify(token, VERIFY_SOCKET_SECRET) as UserVerifyType;

            const user = await this.prisma.user.findUnique({
                where: { id: decode.id },
            });
            if (!user) {
                throw new BadRequestException('User not found');
            }
            if (user.isVerified && user.provider == null) {
                throw new BadRequestException('Email already verified');
            }
            try {
                return await this.prisma.$transaction(async (prisma) => {
                    const now = new Date();
                    const cooldown = 60 * 1000;
                    if (user.lastResendAt && now.getTime() - user.lastResendAt.getTime() < cooldown) {
                        const remainingTime = Math.ceil((cooldown - (now.getTime() - user.lastResendAt.getTime())) / 1000);
                        throw new BadRequestException(`Wait ${remainingTime} seconds before resending the verification link.`);
                    }
                    await prisma.user.update({
                        where: { id: user.id },
                        data: { lastResendAt: now },
                    });
                    const payload = { id: user.id };
                    const verificationToken = generateVeriifyToken(payload);
                    await this.mailService.sendVerificationEmail(user.email, user.name, verificationToken, token);
                    return {
                        message: 'Resend verification link successfully. Please check your email.',
                    }
                })
            }
            catch (error) {
                throw error;
            }
        } catch (error) {
            if (error instanceof jwt.TokenExpiredError) {
                throw new UnauthorizedException('Token Expired');
            } else if (error instanceof jwt.JsonWebTokenError) {
                throw new BadRequestException('Token Invalid');
            }
            throw error;
        }
    }

    async verifyEmail(token: string, socketToken: string) {
        if (!token || !socketToken) {
            throw new BadRequestException('Token is required');
        }
        try {
            const decode = jwt.verify(token, VERIFY_SECRET) as UserVerifyType;
            const user = await this.prisma.user.findUnique({
                where: { id: decode.id },
            })
            if (!user) {
                throw new BadRequestException('User not found');
            }
            if (user.isVerified && user.provider == null) {
                throw new BadRequestException('Email Already Verified');
            }
            await this.prisma.user.update({
                where: { id: user.id },
                data: { isVerified: true },
            })

            const loginToken = generateLoginToken({ id: user.id });
            try {
                jwt.verify(socketToken, VERIFY_SOCKET_SECRET);
                this.verificationGateway.sendVerificationSuccess(socketToken, loginToken);
            } catch (error) { }

            return {
                message: 'Email verified successfully',
            };
        } catch (error) {
            if (error instanceof jwt.TokenExpiredError) {
                throw new UnauthorizedException('Verification link is Expired');
            } else if (error instanceof jwt.JsonWebTokenError) {
                throw new BadRequestException('Verification link is Invalid');
            }
            throw error;
        }
    }

    async checkUserStatus(token: string) {
        try {
            const decode = jwt.verify(token, VERIFY_SOCKET_SECRET, { ignoreExpiration: true }) as UserVerifyType;
            const user = await this.prisma.user.findUnique({
                where: { id: decode.id },
            })
            if (!user) {
                throw new BadRequestException('User not found');
            } 
            return {
                status: user.isVerified
            }
        } catch (error) {
            if (error instanceof jwt.JsonWebTokenError) {
                throw new BadRequestException('Token Invalid');
            }
            throw error;
        }
    }

    async forgotPassword(data: ForgotPasswordDto) {
        const user = await this.prisma.user.findFirst({
            where: { email: data.email, provider: null, isVerified: true },
        })
        if (!user) {
            throw new BadRequestException('User not found');
        }
        const now = new Date();
        const cooldown = 60 * 1000;
        if (user.lastResendAt && now.getTime() - user.lastResendAt.getTime() < cooldown) {
            const remainingTime = Math.ceil((cooldown - (now.getTime() - user.lastResendAt.getTime())) / 1000);
            throw new BadRequestException(`Wait ${remainingTime} seconds before resending the verification link.`);
        }
        const payload = { id: user.id };
        const resetToken = generateResetToken(payload);
        await this.prisma.user.update({
            where: { id: user.id },
            data: { lastResendAt: now , resetToken },
        });
        await this.mailService.sendResetPasswordEmail(user.email, user.name, resetToken);
        return {
            message: 'Reset password link sent successfully. Please check your email.',
        };
    }

    async resetPassword(data: ResetPasswordDto) {
        const { token, password } = data;
        try {
            const decode = jwt.verify(token, RESET_SECRET) as UserVerifyType;
            const user = await this.prisma.user.findUnique({
                where: { id: decode.id },
            })
            if (!user) {
                throw new BadRequestException('User not found');
            }
            if (user.resetToken !== token) {
                throw new BadRequestException('Token expired');
            }
            const hashedPassword = await bcrypt.hash(password, 10);
            await this.prisma.user.update({
                where: { id: user.id },
                data: { password: hashedPassword, resetToken: null },
            })
            return {
                message: 'Password reset successfully',
                email: user.email
            }
        } catch (error) {
            if (error instanceof jwt.TokenExpiredError) {
                throw new UnauthorizedException('Reset token expired');
            } else if (error instanceof jwt.JsonWebTokenError) {
                throw new BadRequestException('Invalid reset token');
            }
            throw error;
        }
    }

    async login(data: LoginDto, deviceInfo: string, ipAddress: string) {
        const user = await this.prisma.user.findFirst({
            where: { email: data.email },
        })
        if (!user || !user.password || !(await bcrypt.compare(data.password, user.password))) {
            throw new UnauthorizedException('Invalid username or password');
        }
        if (!user.isVerified) {
            throw new UnauthorizedException('Email is not verified');
        }
        return await this.loginService(user.id, user.email, user.name, deviceInfo, ipAddress, user.avatar);
    }


    async loginToken(token: string, deviceInfo: string, ipAddress: string) {
        const decode = jwt.verify(token, VERIFY_LOGIN_SECRET) as UserVerifyType;
        const user = await this.prisma.user.findUnique({
            where: { id: decode.id },
        })
        if (!user) {
            throw new UnauthorizedException('invalid username or password');
        }
        if (!user.isVerified) {
            throw new UnauthorizedException('Email is not verified');
        }
        return await this.loginService(user.id, user.email, user.name, deviceInfo, ipAddress, user.avatar);
    }

    private async loginService(id: string, email: string, name: string, deviceInfo: string, ipAddress: string, avatar: string | null) {
        const payload = { id: id, email: email, name: name };
        const accessToken = generateAccessToken(payload);
        const refreshToken = generateRefreshToken({ id: id });

        await this.prisma.refreshToken.create({
            data: {
                userId: id,
                refreshToken,
                deviceInfo,
                ipAddress,
                expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            },
        });
        return { message: "Login Success", accessToken, refreshToken, name, avatar };
    }

    async refresh(refreshToken: string) {
        // let decode = jwt.decode(refreshToken) as any;
        try {
            const payload = jwt.verify(refreshToken, REFRESH_SECRET, { ignoreExpiration: true }) as UserRefreshType;
            const user = await this.prisma.user.findUnique({
                where: { id: payload.id },
                include: { RefreshToken: true },
            });
            const refreshTokenRecord = user?.RefreshToken.find(rt => rt.refreshToken === refreshToken);
            if (!user || !refreshTokenRecord) {
                throw new UnauthorizedException('Invalid refresh token');
            }
            if (refreshTokenRecord) {
                const expiresIn = refreshTokenRecord.expiresAt.getTime() - Date.now();
                const oneDayInMilliseconds = 24 * 60 * 60 * 1000;
                if (expiresIn < oneDayInMilliseconds) {
                    const newRefreshToken = generateRefreshToken({ id: user.id });
                    await this.prisma.refreshToken.update({
                        where: { id: refreshTokenRecord.id },
                        data: { 
                            refreshToken: newRefreshToken,
                            deviceInfo: refreshTokenRecord.deviceInfo,
                            ipAddress: refreshTokenRecord.ipAddress,
                            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
                        },
                    });
                }
            }
            const accessToken = generateAccessToken({ id: user.id, email: user.email, name: user.name });
            return { accessToken, name: user.name, avatar: user.avatar };
        } catch (error) {
            if (error instanceof jwt.TokenExpiredError) {
                // const payload = jwt.decode(refreshToken) as any;
                // await this.prisma.refreshToken.deleteMany({
                //     where: { userId: payload.id, refreshToken },
                // })
                throw new UnauthorizedException('Refresh token expired');
            } else if (error instanceof jwt.JsonWebTokenError) {
                throw new BadRequestException('Invalid refresh token');
            }
            throw error;
        }
    }

    async logout(userId?: string, refreshToken?: string, alluser?: boolean) {
        try {
            if (alluser) {
                await this.prisma.refreshToken.deleteMany({
                    where: { userId },
                });
                return { status: 200 };
            }
            else if (refreshToken) {
                await this.prisma.refreshToken.deleteMany({
                    where: { userId, refreshToken },
                })
                return { status: 200 };
            }
            // if (!isVerified) {
            //     await this.prisma.user.delete({
            //         where: { id: userId },
            //     })
            // }
        } catch {
            return { status: 200 };
        }
    }
}
