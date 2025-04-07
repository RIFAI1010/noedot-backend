import { Server } from 'socket.io';
import {
    WebSocketGateway,
    WebSocketServer,
    OnGatewayConnection,
} from '@nestjs/websockets';

@WebSocketGateway({ cors: true })
export class VerificationGateway implements OnGatewayConnection {
    @WebSocketServer() server: Server;

    handleConnection(client: any) {
        console.log('Client connected:', client.id);
    }

    sendVerificationSuccess(token: string, loginToken: string) {
        this.server.emit(`USER_VERIFIED_${token}`, { success: true, loginToken });
    }
}
