import { Injectable, BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import * as bcrypt from 'bcrypt';
import { RegisterDto } from './dto/register.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { generateAccessToken, generateRefreshToken } from '../common/utils/jwt.util';
import { LoginDto } from './dto/login.dto';
import * as jwt from 'jsonwebtoken';
import { REFRESH_SECRET } from '../config';


@Injectable()
export class AuthService {
    constructor(
        private prisma: PrismaService,
        private mailService: MailService,
    ) { }

    async register(dto: RegisterDto) {
        const { email, password, name } = dto;
        // Cek apakah email sudah terdaftar
        const existingUser = await this.prisma.user.findUnique({
            where: { email },
        });
        if (existingUser) {
            throw new ConflictException('Email is already taken');
        }
        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);
        // Buat kode verifikasi
        const verificationCode = this.generateVerificationCode();
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 jam
        // Gunakan transaksi untuk memastikan konsistensi data
        try {
            return await this.prisma.$transaction(async (prisma) => {
                // Simpan user baru
                const user = await prisma.user.create({
                    data: {
                        email,
                        password: hashedPassword,
                        name,
                    },
                });
                // Buat kode verifikasi
                await prisma.verificationCode.create({
                    data: {
                        code: verificationCode,
                        expiresAt,
                        userId: user.id,
                    },
                });
                // Kirim email verifikasi
                await this.mailService.sendVerificationEmail(email, verificationCode);
                return {
                    message: 'Pendaftaran berhasil. Silakan cek email Anda untuk verifikasi.',
                };
            });
        } catch (error) {
            // Jika terjadi error dalam transaksi, maka data tidak akan disimpan ke database
            throw new Error(`Registrasi gagal: ${error.message}`);
        }
    }

    async verifyEmail(dto: VerifyEmailDto) {
        const { email, code } = dto;
        const user = await this.prisma.user.findUnique({
            where: { email },
            include: {
                VerificationCode: {
                    where: {
                        code,
                        expiresAt: {
                            gt: new Date(),
                        },
                    },
                },
            },
        });
        if (!user) {
            throw new BadRequestException('Email tidak ditemukan');
        }
        if (user.isVerified) {
            throw new BadRequestException('Email sudah diverifikasi');
        }
        if (user.VerificationCode.length === 0) {
            throw new BadRequestException('Kode verifikasi tidak valid atau sudah kadaluarsa');
        }
        // Update user menjadi terverifikasi
        await this.prisma.user.update({
            where: { id: user.id },
            data: { isVerified: true },
        });
        // Hapus kode verifikasi
        await this.prisma.verificationCode.deleteMany({
            where: { userId: user.id },
        });
        return { message: 'Email berhasil diverifikasi' };
    }

    async resendVerificationCode(email: string) {
        const user = await this.prisma.user.findUnique({
            where: { email },
        });
        if (!user) {
            throw new BadRequestException('Email tidak ditemukan');
        }
        if (user.isVerified) {
            throw new BadRequestException('Email sudah diverifikasi');
        }
        // Hapus kode lama
        await this.prisma.verificationCode.deleteMany({
            where: { userId: user.id },
        });
        // Buat kode baru
        const verificationCode = this.generateVerificationCode();
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 jam
        await this.prisma.verificationCode.create({
            data: {
                code: verificationCode,
                expiresAt,
                userId: user.id,
            },
        });
        await this.mailService.sendVerificationEmail(email, verificationCode); // Kirim email verifikasi
        return {
            message: 'Kode verifikasi baru telah dikirim ke email Anda.',
        };
    }

    private generateVerificationCode(): string {
        return Math.floor(100000 + Math.random() * 900000).toString(); // Buat kode acak 6 digit
    }

    async login(data: LoginDto) {
        const user = await this.prisma.user.findFirst({
            where: { email: data.email },
        })
        console.log(user);
        if (!user || !(await bcrypt.compare(data.password, user.password))) {
            throw new UnauthorizedException('invalid username or password');
        }
        if (!user.isVerified) {
            throw new UnauthorizedException('Email is not verified');
        }
        const payload = { id: user.id, email: user.email, username: user.name };
        const accessToken = generateAccessToken(payload);
        const refreshToken = generateRefreshToken(payload);
        await this.prisma.user.update({
            where: { id: user.id },
            data: { refreshToken },
        });
        return { accessToken, refreshToken };
    }

    async refresh(refreshToken: string) {
        // let decode = jwt.decode(refreshToken) as any;
        try {
            const payload = jwt.verify(refreshToken, REFRESH_SECRET) as any;
            // Optional: Check refresh token validity in database
            const user = await this.prisma.user.findUnique({
                where: { id: payload.id },
            });
            if (!user || user.refreshToken !== refreshToken) {
                throw new UnauthorizedException('Invalid refresh token');
            }
            // Generate new access token
            const accessToken = generateAccessToken({ id: user.id, email: user.email, username: user.name });
            return { accessToken };
        } catch (error) {
            if (error instanceof jwt.TokenExpiredError) {
                // await this.prisma.user.update({
                //     where: { id: decode.id },
                //     data: { refreshToken: null },
                // })
                throw new UnauthorizedException('Refresh token expired');
            } else if (error instanceof jwt.JsonWebTokenError) {
                throw new BadRequestException('Invalid refresh token');
            }
            throw error;
        }
    }

    async logout(user){
        try {
            await this.prisma.user.update({
                where: { id: user.id },
                data: { refreshToken: null },
            });
            return { status: 200 };
        } catch {
            return { status: 200 };
        }
    }
}
