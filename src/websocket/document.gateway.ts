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
export class DocumentGateway implements OnGatewayConnection {
    @WebSocketServer() server: Server;

    constructor(
        private readonly prisma: PrismaService,
    ) { }

    private async validateDocumentAccess(documentId: string, userId: string) {
        const document = await this.prisma.document.findUnique({
            where: { id: documentId },
        })
        if (!document) {
            return { hasAccess: false, canEdit: false, message: 'Document not found' };
        }
        const note = await this.prisma.note.findUnique({
            where: { id: document.sourceNoteId },
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
        return { hasAccess, canEdit, message: 'Document access validated' };
    }

    handleConnection(client: any) {
        // try {
        //     const token = client.handshake.auth.token;
        //     if (!token) {
        //         throw new UnauthorizedException('Token is required');
        //     }
        // } catch (error) {
        //     throw new UnauthorizedException('Invalid token');
        // }
    }

    @SubscribeMessage('joinDocument')
    async handleJoinDocument(client: any, payload: { documentId: string }) {
        try {
            const token = client.handshake.auth.token;
            if (!token) {
                client.emit('error', { message: 'Token is required' });
                return;
            }
            // Verifikasi token
            const decoded = jwt.verify(token, ACCESS_SECRET) as UserAccessType;
            const jwtUserId = decoded.id;
            const { documentId } = payload;

            // Cek akses document
            const accessResult = await this.validateDocumentAccess(documentId, jwtUserId);
            if (!accessResult || !accessResult.hasAccess) {
                client.emit('error', { message: 'Access denied', accessResult  });
                return;
            }
            const { hasAccess, canEdit } = accessResult;
            // Join room untuk document tersebut
            client.join(`document_${documentId}`);
            client.emit(`joinedDocument_${documentId}`, { documentId });
        } catch (error) {
            if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
                client.emit('error', { message: 'Invalid or expired token' });
            } else {
                client.emit('error', { message: 'Internal server error' });
            }
        }
    }

    async sendDocumentUpdated(documentId: string, userId: string, data: any) {
        // Dapatkan semua socket yang terhubung ke room document
        const sockets = await this.server.in(`document_${documentId}`).fetchSockets();
        // Validasi akses untuk setiap socket
        for (const socket of sockets) {
            try {
                const token = socket.handshake.auth.token;
                if (!token) continue;
                const decoded = jwt.verify(token, ACCESS_SECRET) as UserAccessType;
                const jwtUserId = decoded.id;
                // Cek akses document
                const accessResult = await this.validateDocumentAccess(documentId, jwtUserId);
                if (!accessResult || !accessResult.hasAccess) {
                    // Jika tidak memiliki akses, keluarkan dari room
                    socket.emit('error', { message: 'Access denied', code: 403 });
                    socket.leave(`document_${documentId}`);
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
                socket.emit(`joinedDocument_${documentId}`, data);
            } catch (error) {
                // Jika terjadi error validasi, keluarkan dari room
                socket.leave(`document_${documentId}`);
                socket.emit('error', { message: 'Invalid token', code: 401 });
            }
        }
    }

} 