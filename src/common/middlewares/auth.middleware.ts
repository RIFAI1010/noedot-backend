import { Injectable, NestMiddleware, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NextFunction, Request, Response } from 'express';
import * as jwt from 'jsonwebtoken';
import { ACCESS_SECRET } from '../../config';
import { UserAccessType } from '../utils/jwt.util';

@Injectable()
export class AuthMiddleware implements NestMiddleware {
  constructor( private readonly configService: ConfigService ) { }
  async use(req: any, res: Response, next: NextFunction) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      throw new UnauthorizedException('No token provided');
    }
    try {
      const decoded = jwt.verify(token, ACCESS_SECRET) as UserAccessType;
      // if (decoded.isVerified === false) {
      //   throw new UnauthorizedException('Pending user');
      // }
      req.user = decoded;
    } catch (error) {
      throw new UnauthorizedException('Invalid or expired token');
    }
    next();
  }
}
