import * as jwt from 'jsonwebtoken';
const SECRET = 'your_secret_key';
const REFRESH_SECRET = 'your_refresh_secret_key';

export const generateAccessToken = (payload: object) =>
    jwt.sign(payload, SECRET, { expiresIn: '10h' });

export const generateRefreshToken = (payload: object) =>
    jwt.sign(payload, REFRESH_SECRET, { expiresIn: '7d' });
