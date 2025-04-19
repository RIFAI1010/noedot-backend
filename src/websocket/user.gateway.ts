import { Server } from 'socket.io';
import {
    WebSocketGateway,
    WebSocketServer,
    OnGatewayConnection,
    SubscribeMessage,
} from '@nestjs/websockets';
import { UnauthorizedException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { ACCESS_SECRET } from 'src/config';
import { UserAccessType } from 'src/common/utils/jwt.util';

@WebSocketGateway({
    cors: {
        origin: '*',
        methods: ['GET', 'POST'],
        credentials: true,
    },
})
export class UserGateway implements OnGatewayConnection {
    @WebSocketServer() server: Server;

    constructor(
    ) { }

    handleConnection(client: any) {
        try {
            const token = client.handshake.auth.token;
            if (!token) {
                throw new UnauthorizedException('Token is required');
            }
        } catch (error) {
            throw new UnauthorizedException('Invalid token');
        }
    }

    @SubscribeMessage('joinUser')
    async handleJoinUser(client: any, payload: { userId: string }) {
        try {
            const token = client.handshake.auth.token;
            if (!token) {
                client.emit('error', { message: 'Token is required' });
                return;
            }
            const decoded = jwt.verify(token, ACCESS_SECRET) as UserAccessType;
            const jwtUserId = decoded.id;
            const { userId } = payload;
            if (jwtUserId !== userId) {
                client.emit('error', { message: 'Access denied' });
                return;
            }
            client.join(`user_${userId}`);
            client.emit(`joinedUser_${userId}`, { userId });
        } catch (error) {
            if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
                client.emit('error', { message: 'Invalid or expired token' });
            } else {
                client.emit('error', { message: 'Internal server error' });
            }
        }
    }

    async sendUserUpdated(userId: string, data?: any) {
        const sockets = await this.server.in(`user_${userId}`).fetchSockets();
        for (const socket of sockets) {
            try {
                const token = socket.handshake.auth.token;
                if (!token) continue;
                const decoded = jwt.verify(token, ACCESS_SECRET) as UserAccessType;
                const jwtUserId = decoded.id;
                if (jwtUserId !== userId) {
                    socket.emit('error', { message: 'Access denied', code: 403 });
                    socket.leave(`user_${userId}`);
                    continue;
                }
                socket.emit(`joinedUser_${userId}`, data);
            } catch (error) {
                socket.leave(`user_${userId}`);
                socket.emit('error', { message: 'Invalid token', code: 401 });
            }
        }
    }

    @SubscribeMessage('leaveUser')
    async handleLeaveUser(client: any, payload: { userId: string }) {
        client.leave(`user_${payload.userId}`);
    }

} 