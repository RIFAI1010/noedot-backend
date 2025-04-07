import { registerAs } from '@nestjs/config';

export default registerAs('oauth', () => ({
    google: {
        clientID: process.env.GOOGLE_CLIENT_ID || '',
        clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
        callbackURL: process.env.GOOGLE_CALLBACK_URL || '',
        scope: ['email', 'profile'],
    },
    // Tambahkan provider lain jika diperlukan (Facebook, GitHub, dll)
}));
