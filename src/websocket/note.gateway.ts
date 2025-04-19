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
        origin: '*',
        methods: ['GET', 'POST'],
        credentials: true,
    },
})
export class NoteGateway implements OnGatewayConnection {
    @WebSocketServer() server: Server;

    constructor(
        private readonly prisma: PrismaService,
    ) { }

    private async validateNoteAccess(noteId: string, userId: string) {
        const note = await this.prisma.note.findUnique({
            where: { id: noteId },
            include: {
                noteEdits: {
                    select: {
                        userId: true,
                    }
                }
            }
        });
        if (!note) {
            return { hasAccess: false, canEdit: false };
        }
        const owner = note.userId === userId;
        const hasAccess = owner ||
            note.status === NoteStatus.public ||
            (note.status === NoteStatus.access && note.noteEdits.some(edit => edit.userId === userId));

        let canEdit = false;
        if (note.editable === Editable.everyone || (note.editable === Editable.access && note.noteEdits.some(edit => edit.userId === userId)) || note.userId === userId) {
            canEdit = true;
        }
        return {hasAccess, canEdit};
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

    @SubscribeMessage('joinNote')
    async handleJoinNote(client: any, payload: { noteId: string }) {
        try {
            const token = client.handshake.auth.token;
            if (!token) {
                client.emit('error', { message: 'Token is required' });
                return;
            }
            // Verifikasi token
            const decoded = jwt.verify(token, ACCESS_SECRET) as UserAccessType;
            const jwtUserId = decoded.id;
            const { noteId } = payload;

            // Cek akses note
            const accessResult = await this.validateNoteAccess(noteId, jwtUserId);
            if (!accessResult || !accessResult.hasAccess) {
                client.emit('error', { message: 'Access denied' });
                return;
            }
            const { hasAccess, canEdit } = accessResult;
            // Join room untuk note tersebut
            client.join(`note_${noteId}`);
            client.emit(`joinedNote_${noteId}`, { noteId });
        } catch (error) {
            if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
                client.emit('error', { message: 'Invalid or expired token' });
            } else {
                client.emit('error', { message: 'Internal server error' });
            }
        }
    }

    async sendNoteUpdated(noteId: string, userId: string, data: any) {
        // Dapatkan semua socket yang terhubung ke room note
        const sockets = await this.server.in(`note_${noteId}`).fetchSockets();
        // Validasi akses untuk setiap socket
        for (const socket of sockets) {
            try {
                const token = socket.handshake.auth.token;
                if (!token) continue;
                const decoded = jwt.verify(token, ACCESS_SECRET) as UserAccessType;
                const jwtUserId = decoded.id;
                // Cek akses note
                const accessResult = await this.validateNoteAccess(noteId, jwtUserId);
                if (!accessResult || !accessResult.hasAccess) {
                    // Jika tidak memiliki akses, keluarkan dari room
                    socket.emit('error', { message: 'Access denied', code: 403 });
                    socket.leave(`note_${noteId}`);
                    continue;
                }
                // if (userId === jwtUserId) {
                //     continue;
                // }
                const { hasAccess, canEdit } = accessResult;
                data.owner = data.ownerId === jwtUserId;
                data.canEdit = canEdit;
                // Kirim notifikasi ke socket yang masih memiliki akses
                socket.emit(`joinedNote_${noteId}`, data);
            } catch (error) {
                // Jika terjadi error validasi, keluarkan dari room
                socket.leave(`note_${noteId}`);
                socket.emit('error', { message: 'Invalid token', code: 401 });
            }
        }
    }

    // @SubscribeMessage('joinUser')
    // async handleJoinUser(client: any, payload: { userId: string }) {
    //     try {
    //         const token = client.handshake.auth.token;
    //         if (!token) {
    //             client.emit('error', { message: 'Token is required' });
    //             return;
    //         }
    //         const decoded = jwt.verify(token, ACCESS_SECRET) as UserAccessType;
    //         const jwtUserId = decoded.id;
    //         const { userId } = payload;
    //         if (jwtUserId !== userId) {
    //             client.emit('error', { message: 'Access denied' });
    //             return;
    //         }
    //         client.join(`user_${userId}`);
    //         client.emit('joinedUser', { userId });
    //     } catch (error) {
    //         if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
    //             client.emit('error', { message: 'Invalid or expired token' });
    //         } else {
    //             client.emit('error', { message: 'Internal server error' });
    //         }
    //     }
    // }

    // async sendUserUpdated(userId: string, data?: any) {
    //     const sockets = await this.server.in(`user_${userId}`).fetchSockets();
    //     for (const socket of sockets) {
    //         try {
    //             const token = socket.handshake.auth.token;
    //             if (!token) continue;
    //             const decoded = jwt.verify(token, ACCESS_SECRET) as UserAccessType;
    //             const jwtUserId = decoded.id;
    //             if (jwtUserId !== userId) {
    //                 socket.emit('error', { message: 'Access denied', code: 403 });
    //                 socket.leave(`user_${userId}`);
    //                 continue;
    //             }
    //             socket.emit('joinedUser', data);
    //         } catch (error) {
    //             socket.leave(`user_${userId}`);
    //             socket.emit('error', { message: 'Invalid token', code: 401 });
    //         }
    //     }
    // }

       // @SubscribeMessage('joinRoom')
    // async handleJoinRoom(client: any, payload: { roomId: string }) {
    //     try {
    //         const token = client.handshake.auth.token;
    //         if (!token) {
    //             client.emit('error', { message: 'Token is required' });
    //             return;
    //         }

    //         // Verifikasi token
    //         const decoded = jwt.verify(token, ACCESS_SECRET) as UserAccessType;
    //         const userId = decoded.id;

    //         // Parse roomId untuk menentukan tipe room dan ID
    //         const [roomType, roomId] = payload.roomId.split(':');

    //         switch (roomType) {
    //             case 'note':
    //                 await this.handleNoteRoom(client, roomId, userId);
    //                 break;
    //             case 'user':
    //                 await this.handleUserRoom(client, roomId, userId);
    //                 break;
    //             default:
    //                 client.emit('error', { message: 'Invalid room type' });
    //         }
    //     } catch (error) {
    //         if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
    //             client.emit('error', { message: 'Invalid or expired token' });
    //         } else {
    //             client.emit('error', { message: 'Internal server error' });
    //         }
    //     }
    // }

    // private async handleNoteRoom(client: any, noteId: string, userId: string) {
    //     try {
    //         // Cek akses note
    //         const hasAccess = await this.validateNoteAccess(noteId, userId);
    //         if (!hasAccess) {
    //             client.emit('error', { message: 'Access denied' });
    //             return;
    //         }

    //         // Join room untuk note tersebut
    //         client.join(`note_${noteId}`);
    //         client.emit('joinedNote', { noteId });
    //     } catch (error) {
    //         client.emit('error', { message: 'Failed to join note room' });
    //     }
    // }

    // private async handleUserRoom(client: any, roomUserId: string, userId: string) {
    //     try {
    //         // Verifikasi bahwa user hanya bisa join ke room mereka sendiri
    //         if (userId !== roomUserId) {
    //             client.emit('error', { message: 'Access denied' });
    //             return;
    //         }

    //         // Join room untuk user
    //         client.join(`user_${userId}`);
    //         client.emit('joinedUser', { userId });
    //     } catch (error) {
    //         client.emit('error', { message: 'Failed to join user room' });
    //     }
    // }

    // @SubscribeMessage('leaveRoom')
    // async handleLeaveRoom(client: any, payload: { roomId: string }) {
    //     try {
    //         const [roomType, roomId] = payload.roomId.split(':');

    //         // Leave the room
    //         client.leave(`${roomType}:${roomId}`);

    //         // Emit event berdasarkan tipe room
    //         if (roomType === 'note') {
    //             client.emit('leftNote', { noteId: roomId });
    //         } else if (roomType === 'user') {
    //             client.emit('leftUser', { userId: roomId });
    //         }
    //     } catch (error) {
    //         client.emit('error', { message: 'Failed to leave room' });
    //     }
    // }

    private async reorderNoteBlocks(noteId: string) {
        // Ambil semua note block yang tersisa
        const remainingBlocks = await this.prisma.noteBlock.findMany({
            where: { noteId },
            orderBy: { position: 'asc' }
        });

        // Update posisi untuk setiap block
        for (let i = 0; i < remainingBlocks.length; i++) {
            await this.prisma.noteBlock.update({
                where: { id: remainingBlocks[i].id },
                data: { position: i }
            });
        }
    }

    @SubscribeMessage('deleteNoteBlock')
    async handleDeleteNoteBlock(client: any, payload: { noteId: string, blockId: string }) {
        try {
            const token = client.handshake.auth.token;
            if (!token) {
                client.emit('error', { message: 'Token is required' });
                return;
            }

            const decoded = jwt.verify(token, ACCESS_SECRET) as UserAccessType;
            const userId = decoded.id;
            const { noteId, blockId } = payload;

            // Cek akses note
            const accessResult = await this.validateNoteAccess(noteId, userId);
            if (!accessResult || !accessResult.canEdit) {
                client.emit('error', { message: 'Access denied' });
                return;
            }

            // Hapus note block
            await this.prisma.noteBlock.delete({
                where: { id: blockId }
            });

            // Rapihkan posisi note block yang tersisa
            await this.reorderNoteBlocks(noteId);

            // Kirim notifikasi ke semua user yang terhubung kecuali pengirim
            const sockets = await this.server.in(`note_${noteId}`).fetchSockets();
            for (const socket of sockets) {
                try {
                    const socketToken = socket.handshake.auth.token;
                    if (!socketToken) continue;
                    const socketDecoded = jwt.verify(socketToken, ACCESS_SECRET) as UserAccessType;
                    if (socketDecoded.id === userId) continue;
                    socket.emit('noteBlockDeleted', { blockId });
                } catch (error) {
                    socket.leave(`note_${noteId}`);
                }
            }

            client.emit('noteBlockDeleted', { blockId });
        } catch (error) {
            client.emit('error', { message: 'Failed to delete note block' });
        }
    }

} 