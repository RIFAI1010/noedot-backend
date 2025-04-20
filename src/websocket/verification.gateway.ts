import { Server } from 'socket.io';
import {
    WebSocketGateway,
    WebSocketServer,
    OnGatewayConnection,
} from '@nestjs/websockets';

@WebSocketGateway({ cors: {
    origin: [process.env.FRONTEND_URL || 'http://localhost:3000', 'http://localhost:3044', 'http://192.168.18.121:3000'],
    methods: ['GET', 'POST'],
    credentials: true,
}, })
export class VerificationGateway implements OnGatewayConnection {
    @WebSocketServer() server: Server;

    handleConnection(client: any) {
        console.log('Client connected:', client.id);
    }

    sendVerificationSuccess(token: string, loginToken: string) {
        this.server.emit(`USER_VERIFIED_${token}`, { success: true, loginToken });
    }
}
