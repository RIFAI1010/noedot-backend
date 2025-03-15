import { Injectable } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';

@Injectable()
export class MailService {
    constructor(private mailerService: MailerService) { }

    async sendVerificationEmail(to: string, code: string) {
        await this.mailerService.sendMail({
            to,
            subject: 'Verifikasi Email',
            html: `
        <h1>Verifikasi Email Anda</h1>
        <p>Terima kasih telah mendaftar. Berikut adalah kode verifikasi Anda:</p>
        <h2>${code}</h2>
        <p>Kode ini akan kedaluwarsa dalam 24 jam.</p>
    `,
        });
    }
}

