import { IsNotEmpty, MinLength, IsEmail } from 'class-validator';

export class ForgotPasswordDto {
    @IsEmail()
    @IsNotEmpty()
    email: string;
}

export class LoginDto {
    @IsEmail()
    email: string;

    @IsNotEmpty()
    password: string;
}

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

export class ResendVerificationDto {
    // @IsEmail()
    // @IsNotEmpty()
    // email: string;

    @IsNotEmpty()
    resendToken: string;
}

export class ResetPasswordDto {
    @IsNotEmpty()
    @MinLength(6)
    password: string;

    @IsNotEmpty()
    token: string;
}

export class VerifyEmailDto {
    // @IsEmail()
    // @IsNotEmpty()
    // email: string;

    // @IsNotEmpty()
    // code: string;

    @IsNotEmpty()
    verificationToken: string;

}