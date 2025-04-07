import { Injectable } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';
import { ConfigService } from '@nestjs/config';
import { FRONTEND_URL } from 'src/config';

@Injectable()
export class MailService {
    constructor(private mailerService: MailerService, private configService: ConfigService) { }

    async sendVerificationEmail(to: string, name: string, token: string, socketToken: string) {
        const url = `${FRONTEND_URL}/verify?token=${token}&socketToken=${socketToken}`;
        await this.mailerService.sendMail({
            to,
            subject: 'Email Verification',
            html: `
        <h1>Verify Your Email</h1>
        <p>Hi ${name},</p>
        <p>Thank you for registering. You have registered as <strong>${name}</strong>. Here is your verification code:</p>
        <a href="${url}">Verify</a>
        <p>This code will expire in 1 hour.</p>
    `,
        });
    }

    async sendResetPasswordEmail(to: string, name: string, token: string) {
        const url = `${FRONTEND_URL}/reset?token=${token}`;
        await this.mailerService.sendMail({
            to,
            subject: 'Reset Password',
            html: `
        <h1>Reset Your Password</h1>
        <p>Hi ${name},</p>
        <p>You have requested to reset your password. Here is your reset code:</p>
        <a href="${url}">Reset</a>
        <p>This code will expire in 1 hour.</p>
        `,
        });
    }
}

