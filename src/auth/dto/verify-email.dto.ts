import { IsEmail, IsNotEmpty } from '@nestjs/class-validator';

export class VerifyEmailDto {
    @IsEmail()
    @IsNotEmpty()
    email: string;

    @IsNotEmpty()
    code: string;
}
