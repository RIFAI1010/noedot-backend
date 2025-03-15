import { Injectable, NestMiddleware, UnauthorizedException } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import * as jwt from 'jsonwebtoken';
import { SECRET } from '../../config';

@Injectable()
export class AuthMiddleware implements NestMiddleware {
  async use(req: any, res: Response, next: NextFunction) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      throw new UnauthorizedException('No token provided');
    }
    try {
      const decoded = jwt.verify(token, SECRET) as any;
      req.user = decoded;
    } catch (error) {
      throw new UnauthorizedException('Invalid or expired token');
    }
    next();
  }
}
