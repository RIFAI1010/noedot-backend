import { IsEmail, IsNotEmpty } from '@nestjs/class-validator';

export class ResendVerificationDto {
    @IsEmail()
    @IsNotEmpty()
    email: string;
}
