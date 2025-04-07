import * as jwt from 'jsonwebtoken';
import { ACCESS_SECRET, REFRESH_SECRET, VERIFY_SECRET, RESET_SECRET, VERIFY_SOCKET_SECRET, VERIFY_LOGIN_SECRET } from 'src/config';

export type UserAccessType = {
    // isVerified: boolean;
    id: string;
    email: string;
    name: string;
};

export const generateAccessToken = (payload: UserAccessType) => {
    return jwt.sign(payload, ACCESS_SECRET, { expiresIn: '10h' });
}

export type UserRefreshType = { id: string };
export const generateRefreshToken = (payload: UserRefreshType) => {
    return jwt.sign(payload, REFRESH_SECRET, { expiresIn: '7d' });
}

export type UserVerifyType = { id: string };
export const generateVeriifyToken = (payload: UserVerifyType) => {
    return jwt.sign(payload, VERIFY_SECRET, { expiresIn: '1h' });
}
export const generateResetToken = (payload: UserVerifyType) => {
    return jwt.sign(payload, RESET_SECRET, { expiresIn: '1h' });
}
export const generateVerifySocketToken = (payload: UserVerifyType) => {
    return jwt.sign(payload, VERIFY_SOCKET_SECRET, { expiresIn: '1h' });
}
export const generateLoginToken = (payload: UserVerifyType) => {
    return jwt.sign(payload, VERIFY_LOGIN_SECRET, { expiresIn: '30s' });
}