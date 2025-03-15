import { IsEmail, IsNotEmpty, MinLength } from '@nestjs/class-validator';

export class RegisterDto {
    @IsEmail()
    @IsNotEmpty()
    email: string;

    @IsNotEmpty()
    @MinLength(6)
    password: string;

    @IsNotEmpty()
    name: string;
}
