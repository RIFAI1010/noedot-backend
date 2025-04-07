import { ConfigService } from '@nestjs/config';

const configService = new ConfigService();

export const FRONTEND_URL = configService.get<string>('FRONTEND_URL') || 'http://localhost:3000';

export const ACCESS_SECRET = configService.get<string>('ACCESS_SECRET') || '!@#Abc123';
export const REFRESH_SECRET = configService.get<string>('REFRESH_SECRET') || '!@#Abc123';
export const VERIFY_SECRET = configService.get<string>('VERIFY_SECRET') || '!@#Abc123';
export const RESET_SECRET = configService.get<string>('RESET_SECRET') || '!@#Abc123';
export const VERIFY_SOCKET_SECRET = configService.get<string>('VERIFY_SOCKET_SECRET') || '!@#Abc123';
export const VERIFY_LOGIN_SECRET = configService.get<string>('VERIFY_LOGIN_SECRET') || '!@#Abc123';
