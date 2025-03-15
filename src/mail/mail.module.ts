import { Module } from '@nestjs/common';
import { MailerModule } from '@nestjs-modules/mailer';
import { MailService } from './mail.service';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
    imports: [
        ConfigModule.forRoot(),
        MailerModule.forRootAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: (config: ConfigService) => ({
                transport: {
                    host: config.get('MAIL_HOST'),
                    port: config.get('MAIL_PORT'),
                    secure: config.get('MAIL_SECURE', false),
                    auth: {
                        user: config.get('MAIL_USER'),
                        pass: config.get('MAIL_PASSWORD'),
                    },
                    tls: {
                        rejectUnauthorized: false  // Tambahkan ini untuk testing 
                    },
                },
                defaults: {
                    from: `"Noedot" <${config.get('MAIL_FROM')}>`,
                },
                debug: true,
                logger: true,
            }),
        }),
    ],
    providers: [MailService],
    exports: [MailService],
})
export class MailModule { }
