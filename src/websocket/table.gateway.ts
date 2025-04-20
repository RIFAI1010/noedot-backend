import { Server } from 'socket.io';
import {
    WebSocketGateway,
    WebSocketServer,
    OnGatewayConnection,
    SubscribeMessage,
} from '@nestjs/websockets';
import { PrismaService } from 'src/prisma/prisma.service';
import { NoteStatus, Editable } from '@prisma/client';
import { UnauthorizedException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { ACCESS_SECRET } from 'src/config';
import { UserAccessType } from 'src/common/utils/jwt.util';

@WebSocketGateway({
    cors: {
        origin: [process.env.FRONTEND_URL || 'http://localhost:3000', 'http://localhost:3044', 'http://192.168.18.121:3000'],
        methods: ['GET', 'POST'],
        credentials: true,
    },
})
export class TableGateway implements OnGatewayConnection {
    @WebSocketServer() server: Server;

    constructor(
        private readonly prisma: PrismaService,
    ) { }

    private async validateTableAccess(tableId: string, userId: string) {
        const table = await this.prisma.table.findUnique({
            where: { id: tableId },
        })
        if (!table) {
            return { hasAccess: false, canEdit: false, message: 'Table not found' };
        }
        const note = await this.prisma.note.findUnique({
            where: { id: table.sourceNoteId },
            include: {
                noteEdits: {
                    select: {
                        userId: true,
                    }
                }
            }
        })
        if (!note) {
            return { hasAccess: false, canEdit: false, message: 'Note not found' };
        }
        const owner = note.userId === userId;
        const hasAccess = owner ||
            note.status === NoteStatus.public ||
            (note.status === NoteStatus.access && note.noteEdits.some(edit => edit.userId === userId));

        let canEdit = false;
        if (note.editable === Editable.everyone || (note.editable === Editable.access && note.noteEdits.some(edit => edit.userId === userId)) || note.userId === userId) {
            canEdit = true;
        }
        return { hasAccess, canEdit, message: 'Table access validated' };
    }

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

    @SubscribeMessage('joinTable')
    async handleJoinTable(client: any, payload: { tableId: string }) {
        try {
            const token = client.handshake.auth.token;
            if (!token) {
                client.emit('error', { message: 'Token is required' });
                return;
            }
            // Verifikasi token
            const decoded = jwt.verify(token, ACCESS_SECRET) as UserAccessType;
            const jwtUserId = decoded.id;
            const { tableId } = payload;

            // Cek akses table
            const accessResult = await this.validateTableAccess(tableId, jwtUserId);
            if (!accessResult || !accessResult.hasAccess) {
                client.emit('error', { message: 'Access denied', accessResult  });
                return;
            }
            const { hasAccess, canEdit } = accessResult;
            // Join room untuk table tersebut
            client.join(`table_${tableId}`);
            client.emit(`joinedTable_${tableId}`, { tableId });
        } catch (error) {
            if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
                client.emit('error', { message: 'Invalid or expired token' });
            } else {
                client.emit('error', { message: 'Internal server error' });
            }
        }
    }

    async sendTableUpdated(tableId: string, userId: string, data: any) {
        // Dapatkan semua socket yang terhubung ke room table
        const sockets = await this.server.in(`table_${tableId}`).fetchSockets();
        // Validasi akses untuk setiap socket
        for (const socket of sockets) {
            try {
                const token = socket.handshake.auth.token;
                if (!token) continue;
                const decoded = jwt.verify(token, ACCESS_SECRET) as UserAccessType;
                const jwtUserId = decoded.id;
                // Cek akses table
                const accessResult = await this.validateTableAccess(tableId, jwtUserId);
                if (!accessResult || !accessResult.hasAccess) {
                    // Jika tidak memiliki akses, keluarkan dari room
                    socket.emit('error', { message: 'Access denied', code: 403 });
                    socket.leave(`table_${tableId}`);
                    continue;
                }
                // if (userId === jwtUserId &&
                //     data.socketAction !== 'updateRowData' &&
                //     data.socketAction !== 'createCol' &&
                //     data.socketAction !== 'createRow' &&
                //     data.socketAction !== 'deleteCol' &&
                //     data.socketAction !== 'deleteRow'
                // ) {
                //     continue;
                // }
                const { hasAccess, canEdit } = accessResult;
                data.canEdit = canEdit;
                // Kirim notifikasi ke socket yang masih memiliki akses
                socket.emit(`joinedTable_${tableId}`, data);
            } catch (error) {
                // Jika terjadi error validasi, keluarkan dari room
                socket.leave(`table_${tableId}`);
                socket.emit('error', { message: 'Invalid token', code: 401 });
            }
        }
    }

} 