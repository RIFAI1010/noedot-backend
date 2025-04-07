import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
// import { JwtService } from '@nestjs/jwt';
import { v4 as uuidv4 } from 'uuid';
import { generateAccessToken, generateRefreshToken } from 'src/common/utils/jwt.util';
import { access } from 'fs';

interface OAuthUserData {
    provider: string;
    providerId: string;
    email: string;
    name: string;
    isVerified: boolean;
    avatar: string;
}

@Injectable()
export class OAuthService {
    constructor(
        private prisma: PrismaService,
        // private jwtService: JwtService,
    ) { }

    async validateOAuthUser(userData: OAuthUserData) {
        const { provider, providerId, email, name, isVerified, avatar } = userData;
        // console.log(userData.avatar)

        // Cari user berdasarkan provider dan providerId
        let user = await this.prisma.user.findFirst({
            where: {
                OR: [
                    { provider, providerId },
                    { email }, // Cek juga email untuk menghindari duplikasi
                ],
            },
        });

        if (!user) {
            // Buat user baru jika belum ada
            user = await this.prisma.user.create({
                data: {
                    email,
                    name,
                    provider,
                    providerId,
                    isVerified,
                    avatar,
                },
            });
        } else if (user.provider !== provider) {
            // Jika user sudah ada dengan email yang sama tapi provider berbeda
            // Anda bisa memilih untuk menggabungkan akun atau menolak login
            // Di sini kita update provider info
            user = await this.prisma.user.update({
                where: { id: user.id },
                data: {
                    provider,
                    providerId,
                    isVerified: isVerified || user.isVerified,
                    avatar,
                },
            });
        }

        console.log('User:', user);
        return user;
    }

    async generateTokens(userId: string, deviceInfo: string, ipAddress: string) {
        // Buat payload untuk JWT
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
        })
        if (!user) {
            throw new Error('User not found');
        }
        const payload = { id: user.id, email: user.email, name: user.name };
        // Generate refresh token
        const refreshToken = generateRefreshToken({ id: user.id });
        const accessToken = generateAccessToken(payload);
        // Simpan refresh token di database
        // await this.prisma.refreshToken.create({
        //     data: {
        //         token: refreshToken,
        //         userId,
        //         expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 hari
        //     },
        // });

        // await this.prisma.user.update({
        //     where: { id: userId },
        //     data: { refreshToken },
        // });
        await this.prisma.refreshToken.create({
            data: {
                userId: userId,
                refreshToken,
                deviceInfo,
                ipAddress,
                expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 hari
            },
        });
        return { refreshToken, accessToken, name: user.name, avatar: user.avatar };
    }
}
