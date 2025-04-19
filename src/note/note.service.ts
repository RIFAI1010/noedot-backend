import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "src/prisma/prisma.service";
import { CreateNoteDto, UpdateNoteDto, UpdateNoteTitleDto } from "./dto/note.dto";
import { BlockType, Editable, Note, NoteStatus, NoteUserOpen } from "@prisma/client";
import { User } from "@prisma/client";
import { NoteGateway } from "src/websocket/note.gateway";
import { UserGateway } from "src/websocket/user.gateway";
import { TableGateway } from "src/websocket/table.gateway";
@Injectable()
export class NoteService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly noteGateway: NoteGateway,
        private readonly userGateway: UserGateway,
        private readonly tableGateway: TableGateway
    ) { }

    async createNote(data: CreateNoteDto, userId: string) {
        const note = await this.prisma.note.create({
            data: {
                title: data.title,
                status: data.status,
                editable: data.editable,
                user: {
                    connect: {
                        id: userId,
                    },
                },
                noteEdits: {
                    create: data.userAccess?.map(user => ({
                        user: {
                            connect: { id: user }
                        }
                    }))
                }
            },
        });
        return note;
    }

    async updateNote(id: string, data: UpdateNoteDto, userId: string) {
        const note = await this.prisma.note.findUnique({
            where: { id, userId },
            include: {
                noteEdits: true,
            }
        });
        if (!note) {
            throw new NotFoundException('Note not found');
        }
        
        // if (note.status === NoteStatus.private && note.userId !== userId) {
        //     throw new ForbiddenException('You are not allowed to update this note');
        // }
        // if (note.editable === Editable.me && note.userId !== userId) {
        //     throw new ForbiddenException('You are not allowed to update this note');
        // }
        // if (!note.noteEdits.some(edit => edit.userId === userId) && note.userId !== userId) {
        //     throw new ForbiddenException('You are not allowed to update this note');
        // }
        // if (note.userId !== userId) {
        //     data.title = undefined;
        //     data.status = undefined;
        //     data.editable = undefined;
        // }
        // Dapatkan user yang sudah ada di database
        const existingUsers = note.noteEdits.map(edit => edit.userId);
        // Validasi semua userIds terlebih dahulu
        for (const user of note.noteEdits) {
            // await this.noteGateway.sendUserAccessNoteUpdated(user.userId);
            await this.userGateway.sendUserUpdated(user.userId);
        }
        const validUsers = await this.prisma.user.findMany({
            where: {
                id: {
                    in: data.userAccess
                }
            },
            select: {
                id: true
            }
        });
        const validUserIds = validUsers.map(user => user.id);
        // User yang perlu ditambahkan (yang valid dan belum ada di database)
        const usersToAdd = validUserIds.filter(user => !existingUsers.includes(user));
        // User yang perlu dihapus (ada di database tapi tidak di data.userAccess yang valid)
        const usersToRemove = existingUsers.filter(user => !validUserIds.includes(user));
        // Tambahkan user baru yang valid
        for (const user of usersToAdd) {
            await this.prisma.noteEditAccess.create({
                data: {
                    noteId: id,
                    userId: user,
                },
            });
            // await this.noteGateway.sendUserAccessNoteUpdated(user);
        }
        // Hapus user yang tidak ada di data.userAccess
        if (usersToRemove.length > 0) {
            await this.prisma.noteEditAccess.deleteMany({
                where: {
                    noteId: id,
                    userId: {
                        in: usersToRemove
                    }
                }
            });
            for (const user of usersToRemove) {
                // await this.noteGateway.sendUserAccessNoteUpdated(user);
            }
        }

        const updatedNote = await this.prisma.note.update({
            where: { id },
            data: {
                title: data.title,
                status: data.status,
                editable: data.editable
            },
            include: {
                noteBlocks: true
            }
        });

        await this.noteGateway.sendNoteUpdated(id, userId, {
            id,
            title: data.title,
            status: data.status,
            editable: data.editable,
            ownerId: note.userId,
            updatedAt: new Date(),
            socketAction: 'updateNote'
        });

        for (const block of updatedNote.noteBlocks) {
            if (block.type === BlockType.table && block.referenceId) {
                const tableNote = await this.prisma.tableNote.findFirst({   
                    where: { id: block.referenceId },
                    include: {
                        table: true
                    }
                });
                if (tableNote && tableNote.table) {
                    await this.tableGateway.sendTableUpdated(tableNote.table.id, userId, {
                        id: tableNote.table.id,
                        updatedAt: new Date(),
                        socketAction: 'updateNote'
                    });
                }
            }
        }

        return updatedNote;
    }

    async getNotes(userId: string, limit: number, page: number, sort?: string, my?: boolean) {
        //sort: updatedat desc,
        page = page || 1;
        limit = limit || 10;
        let notes: (Note & { noteUserOpen: NoteUserOpen[] })[] = [];
        if (my) {
            notes = await this.prisma.note.findMany({
                where: {
                    userId,
                },
                include: {
                    noteUserOpen: {
                        where: {
                            userId,
                        },
                        take: 1
                    },
                },
                orderBy: {
                    updatedAt: 'desc'
                },
                skip: (page - 1) * limit,
                take: limit,
            });
        } else {
            notes = await this.prisma.note.findMany({
                where: {
                    OR: [
                        { userId },
                        { noteEdits: { some: { userId } }, status: { in: [NoteStatus.access, NoteStatus.public] } }
                    ]
                },
                include: {
                    noteUserOpen: {
                        where: { userId },
                        take: 1
                    },
                },
                orderBy: {
                    updatedAt: 'desc'
                },
                skip: (page - 1) * limit,
                take: limit,
            });
        }

        const notesWithOpenAt = notes.map(note => ({
            ...note,
            openAt: note.noteUserOpen[0]?.openAt || null
        }));

        if (sort === 'openAt') {
            notesWithOpenAt.sort((a, b) => {
                if (!a.openAt) return 1;
                if (!b.openAt) return -1;
                return b.openAt.getTime() - a.openAt.getTime();
            });
        }
        return notesWithOpenAt;
    }

    async getNote(userId: string, id: string) {
        let canEdit = false;
        const note = await this.prisma.note.findUnique({
            where: { id },
            include: {
                noteEdits: {
                    select: {
                        userId: true,
                        user: {
                            select: {
                                id: true,
                                name: true,
                                email: true
                            }
                        }
                    }
                },
                noteUserOpen: { where: { userId } }
            }
        });
        if (!note) {
            throw new NotFoundException('Note not found');
        }
        const owner = note.userId === userId;
        if (!owner && (note.status === NoteStatus.private || (note.status === NoteStatus.access && !note.noteEdits.some(edit => edit.userId === userId)))) {
            throw new ForbiddenException('You are not allowed to access this note');
        }
        if (note.editable === Editable.everyone || (note.editable === Editable.access && note.noteEdits.some(edit => edit.userId === userId)) || note.userId === userId) {
            canEdit = true;
        }
        const noteUserOpen = await this.prisma.noteUserOpen.findFirst({ where: { noteId: id, userId } });
        if (!noteUserOpen) {
            await this.prisma.noteUserOpen.create({ data: { noteId: id, userId } });
        } else {
            await this.prisma.noteUserOpen.update({ where: { id: noteUserOpen.id }, data: { openAt: new Date() } });
        }
        const users = note.noteEdits.map(edit => ({
            id: edit.user.id,
            name: edit.user.name,
            email: edit.user.email
        }));
        const noteBlocks = await this.prisma.noteBlock.findMany({
            where: {
                noteId: id
            },
            orderBy: { position: 'asc' }
        });

        // Ambil table untuk setiap note block yang bertipe table
        for (const block of noteBlocks) {
            if (block.type === BlockType.table && block.referenceId) {
                const tableNote = await this.prisma.tableNote.findFirst({
                    where: { id: block.referenceId },
                    include: {
                        table: {
                            include: {
                                cols: true,
                                rows: {
                                    include: {
                                        rowData: true
                                    }
                                }
                            }
                        }
                    }
                });
                
                if (tableNote) {
                    block['table'] = tableNote.table;
                }
            }
        }

        return {
            ...note,
            canEdit,
            owner,
            noteEdits: users,
            noteBlocks
        }
    }

    async updateNoteTitle(id: string, data: UpdateNoteTitleDto, userId: string) {
        const note = await this.prisma.note.findUnique({
            where: { id },
            include: {
                noteEdits: {
                    select: {
                        userId: true,
                    }
                }
            }
        });
        let canEdit = false;
        if (!note) {
            throw new NotFoundException('Note not found');
        }
        const owner = note.userId === userId;
        if (!owner && (note.status === NoteStatus.private || (note.status === NoteStatus.access && !note.noteEdits.some(edit => edit.userId === userId)))) {
            throw new ForbiddenException('You are not allowed to access this note');
        }
        if (note.editable === Editable.everyone || (note.editable === Editable.access && note.noteEdits.some(edit => edit.userId === userId)) || note.userId === userId) {
            canEdit = true;
        }
        if (!canEdit) {
            throw new ForbiddenException('You are not allowed to edit this note');
        }
        const updatedNote = await this.prisma.note.update({
            where: { id },
            data: {
                title: data.title
            }
        });

        // Kirim notifikasi websocket
        await this.noteGateway.sendNoteUpdated(id, userId, {
            id,
            title: data.title,
            updatedAt: new Date(),
            socketAction: 'updateNoteTitle'
        });

        return { message: 'Note title updated successfully' };
        return {
            ...updatedNote,
            canEdit,
            owner
        };
    }

    async getNoteBlocks(id: string, userId: string) {
        const note = await this.prisma.note.findUnique({
            where: { id },
            include: {
                noteEdits: {
                    select: {
                        userId: true,
                    }
                }
            }
        });
        let canEdit = false;
        if (!note) {
            throw new NotFoundException('Note not found');
        }
        const owner = note.userId === userId;
        if (!owner && (note.status === NoteStatus.private || (note.status === NoteStatus.access && !note.noteEdits.some(edit => edit.userId === userId)))) {
            throw new ForbiddenException('You are not allowed to access this note');
        }
        if (note.editable === Editable.everyone || (note.editable === Editable.access && note.noteEdits.some(edit => edit.userId === userId)) || note.userId === userId) {
            canEdit = true;
        }
        const noteBlocks = await this.prisma.noteBlock.findMany({
            where: { noteId: id },
            orderBy: { position: 'asc' }
        });

        // Ambil table untuk setiap note block yang bertipe table
        for (const block of noteBlocks) {
            if (block.type === BlockType.table && block.referenceId) {
                const tableNote = await this.prisma.tableNote.findFirst({
                    where: { id: block.referenceId },
                    include: {
                        table: true
                    }
                });
                
                if (tableNote && tableNote.table) {
                    block['details'] = tableNote.table;
                }
            }
            // if (block.type === BlockType.document && block.referenceId) {
        }

        return {
            noteBlocks,
            canEdit,
            owner
        }
    }
}
