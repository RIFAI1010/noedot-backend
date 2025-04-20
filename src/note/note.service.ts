import { ForbiddenException, Injectable, NotFoundException, BadRequestException } from "@nestjs/common";
import { PrismaService } from "src/prisma/prisma.service";
import { CreateNoteDto, UpdateNoteDto, UpdateNoteTitleDto } from "./dto/note.dto";
import { BlockType, Editable, Note, NoteBlock, NoteStatus, NoteUserOpen } from "@prisma/client";
import { User } from "@prisma/client";
import { NoteGateway } from "src/websocket/note.gateway";
import { UserGateway } from "src/websocket/user.gateway";
import { TableGateway } from "src/websocket/table.gateway";
import { Direction } from "./dto/note.dto";
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
        // kecualikan user pemilik note
        const validUserIds = validUsers.map(user => user.id).filter(user => user !== note.userId);
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

    async getNotes(userId: string, filter?: string, sort?: string) {
        //sort: updatedat desc,
        let notes: (Note & { noteUserOpen: NoteUserOpen[] })[] = [];
        // if (my) {
        //     notes = await this.prisma.note.findMany({
        //         where: {
        //             userId,
        //         },
        //         include: {
        //             noteUserOpen: {
        //                 where: {
        //                     userId,
        //                 },
        //                 take: 1
        //             },
        //         },
        //         orderBy: {
        //             updatedAt: 'desc'
        //         },
        //     });
        // } else {
        //     notes = await this.prisma.note.findMany({
        //         where: {
        //             OR: [
        //                 { userId },
        //                 { noteEdits: { some: { userId } }, status: { in: [NoteStatus.access, NoteStatus.public] } }
        //             ]
        //         },
        //         include: {
        //             noteUserOpen: {
        //                 where: { userId },
        //                 take: 1
        //             },
        //         },
        //         orderBy: {
        //             updatedAt: 'desc'
        //         },
        //     });
        // }
        if (filter === 'favorite') {
            notes = await this.prisma.note.findMany({
                where: {
                    noteUserFavorites: {
                        some: { userId }
                    }
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
            });
        } else if (filter === 'shared') {
            notes = await this.prisma.note.findMany({
                where: {
                    noteEdits: { some: { userId } },
                    status: { in: [NoteStatus.access, NoteStatus.public] }
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
            });
        } else if (filter === 'all') {
            notes = await this.prisma.note.findMany({
                where: {
                    OR: [
                        { userId },
                        { noteEdits: { some: { userId } }, status: { in: [NoteStatus.access, NoteStatus.public] } },
                        { noteUserFavorites: { some: { userId } } }
                    ]
                },
                include: {
                    noteUserOpen: {
                        where: { userId },
                        take: 1
                    },
                },
            });
        } 
        else {
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
                        table: true
                    }
                });

                if (tableNote) {
                    block['details'] = tableNote.table;
                }
            }
        }

        const noteFavorite = await this.prisma.noteUserFavorite.findFirst({
            where: { noteId: id, userId }
        });

        return {
            ...note,
            canEdit,
            owner,
            noteEdits: users,
            noteBlocks,
            favorite: noteFavorite ? true : false
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
            if (block.type === BlockType.document && block.referenceId) {
                const documentNote = await this.prisma.documentNote.findFirst({
                    where: { id: block.referenceId },
                });
                if (documentNote && documentNote.documentId) {
                    const document = await this.prisma.document.findUnique({
                        where: { id: documentNote.documentId },
                        select: {
                            id: true,
                            name: true,
                            sourceNoteId: true,
                            createdAt: true,
                            updatedAt: true
                        }
                    });
                    if (document) {
                        block['details'] = document;
                    }
                }
            }
        }

        return {
            noteBlocks,
            canEdit,
            owner
        }
    }

    async reorderNoteBlocks(id: string) {
        // Ambil semua note block yang tersisa
        const remainingBlocks = await this.prisma.noteBlock.findMany({
            where: { noteId: id },
            orderBy: { position: 'asc' }
        });

        // Update posisi untuk setiap block
        for (let i = 0; i < remainingBlocks.length; i++) {
            await this.prisma.noteBlock.update({
                where: { id: remainingBlocks[i].id },
                data: { position: i + 1 }
            });
            remainingBlocks[i].position = i + 1;
        }

        return remainingBlocks.map(block => ({ id: block.id, position: block.position }));
    }

    async updateBlockPosition(id: string, blockId: string, direction: Direction, userId: string) {
        const note = await this.prisma.note.findUnique({
            where: { id },
            include: {
                noteBlocks: true,
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

        const block = await this.prisma.noteBlock.findUnique({
            where: { id: blockId },
        });
        console.log('block', block);
        if (!block) {
            throw new NotFoundException('Block not found');
        }
        const remainingBlocks = await this.prisma.noteBlock.findMany({
            where: { noteId: id },
            orderBy: { position: 'asc' }
        });
        let updatedBlock: NoteBlock | null = block;
        if (direction === Direction.UP) {
            console.log('direction up', direction);
            if (block.position === 1) {
                throw new BadRequestException('Block is already at the top');
            }
            // Cari block yang posisinya di atas block yang akan dipindahkan
            const blockAbove = remainingBlocks.find(b => b.position === block.position - 1);
            if (blockAbove) {
                // Tukar posisi
                updatedBlock = await this.prisma.noteBlock.update({
                    where: { id: block.id },
                    data: { position: block.position - 1 }
                });
                await this.prisma.noteBlock.update({
                    where: { id: blockAbove.id },
                    data: { position: block.position }
                });
            }
        } else if (direction === Direction.DOWN) {
            if (block.position === remainingBlocks.length) {
                throw new BadRequestException('Block is already at the bottom');
            }
            // Cari block yang posisinya di bawah block yang akan dipindahkan
            const blockBelow = remainingBlocks.find(b => b.position === block.position + 1);
            if (blockBelow) {
                // Tukar posisi
                updatedBlock = await this.prisma.noteBlock.update({
                    where: { id: block.id },
                    data: { position: block.position + 1 }
                });
                await this.prisma.noteBlock.update({
                    where: { id: blockBelow.id },
                    data: { position: block.position }
                });
            }
        }

        await this.noteGateway.sendNoteUpdated(id, userId, {
            id,
            blockId: block.id,
            newPosition: updatedBlock.position,
            direction,
            socketAction: 'updateBlockPosition'
        });

        return { message: 'Block position updated successfully' };
    }

    async favoriteNote(id: string, userId: string) {
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
        if (!note) {
            throw new NotFoundException('Note not found');
        }
        const owner = note.userId === userId;
        if (!owner && (note.status === NoteStatus.private || (note.status === NoteStatus.access && !note.noteEdits.some(edit => edit.userId === userId)))) {
            throw new ForbiddenException('You are not allowed to access this note');
        }
        const favorite = await this.prisma.noteUserFavorite.findFirst({
            where: { noteId: id, userId },
        });
        if (favorite) {
            throw new BadRequestException('Note is already favorited');
        }
        await this.prisma.noteUserFavorite.create({
            data: { noteId: id, userId },
        });
        return { message: 'Note favorited successfully', favorite: true };
    }

    async unfavoriteNote(id: string, userId: string) {
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
        if (!note) {
            throw new NotFoundException('Note not found');
        }
        const owner = note.userId === userId;
        if (!owner && (note.status === NoteStatus.private || (note.status === NoteStatus.access && !note.noteEdits.some(edit => edit.userId === userId)))) {
            throw new ForbiddenException('You are not allowed to access this note');
        }
        const favorite = await this.prisma.noteUserFavorite.findFirst({
            where: { noteId: id, userId },
        });
        if (!favorite) {
            throw new BadRequestException('Note is not favorited');
        }
        await this.prisma.noteUserFavorite.delete({
            where: { id: favorite.id },
        });
        return { message: 'Note unfavorited successfully', favorite: false };
    }

    //saves notes with tables
    async getNotesWithTables(userId: string, filter?: string, sort?: string) {
        // Dapatkan notes dengan noteblocks
        let notes: (Note & { noteBlocks: NoteBlock[] })[] = [];
        if (filter === 'favorite') {
            notes = await this.prisma.note.findMany({
                where: {
                    noteUserFavorites: {
                        some: {
                            userId
                        }
                    }
                },
                include: {
                    noteBlocks: true
                },
                orderBy: {
                    updatedAt: 'desc'
                }
            });
        } else if (filter === 'shared') {
            notes = await this.prisma.note.findMany({
                where: {
                    noteEdits: {
                        some: {
                            userId
                        }
                    },
                    status: { in: [NoteStatus.access, NoteStatus.public] }
                },
                include: {
                    noteBlocks: true
                },
                orderBy: {
                    updatedAt: 'desc'
                }
            });
        } else {
            notes = await this.prisma.note.findMany({
                where: {
                    userId
                },
                include: {
                    noteBlocks: true
                },
                orderBy: {
                    updatedAt: 'desc'
                }
            });
        }

        // Proses setiap note untuk mendapatkan table asli
        const processedNotes = await Promise.all(notes.map(async (note) => {
            // Filter noteBlocks yang bertipe table
            const tableBlocks = note.noteBlocks.filter(block => block.type === BlockType.table);

            // Dapatkan table notes untuk setiap block
            const tableData = await Promise.all(tableBlocks.map(async (block) => {
                if (!block.referenceId) return null;

                // Dapatkan table note
                const tableNote = await this.prisma.tableNote.findFirst({
                    where: {
                        id: block.referenceId,
                        noteId: note.id  // Menggunakan noteId sebagai pengganti sourceNoteId
                    },
                    include: {
                        table: true
                    }
                });

                if (!tableNote || !tableNote.tableId) return null;

                // Dapatkan table dengan data lengkap
                const table = await this.prisma.table.findUnique({
                    where: { id: tableNote.tableId },
                    include: {
                        // cols: true,
                        // rows: {
                        //     include: {
                        //         rowData: true
                        //     }
                        // }
                    }
                });

                if (!table) return null;

                return {
                    blockId: block.id,
                    position: block.position,
                    tableNote: tableNote,
                    table: table
                };
            }));

            // Filter out null values dan tambahkan ke note
            const validTables = tableData.filter(item => item !== null);

            return {
                ...note,
                tables: validTables
            };
        }));

        return processedNotes;
    }

    async getNotesWithDocuments(userId: string, filter?: string, sort?: string) {
        // Dapatkan notes dengan noteblocks
        let notes: (Note & { noteBlocks: NoteBlock[] })[] = [];
        if (filter === 'favorite') {
            notes = await this.prisma.note.findMany({
                where: {
                    noteUserFavorites: {
                        some: {
                            userId
                        }
                    }
                },
                include: {
                    noteBlocks: true
                },
                orderBy: {
                    updatedAt: 'desc'
                }
            });
        } else if (filter === 'shared') {
            notes = await this.prisma.note.findMany({
                where: {
                    noteEdits: {
                        some: {
                            userId
                        }
                    },
                    status: { in: [NoteStatus.access, NoteStatus.public] }
                },
                include: {
                    noteBlocks: true
                },
                orderBy: {
                    updatedAt: 'desc'
                }
            });
        } else {
            notes = await this.prisma.note.findMany({
                where: {
                    userId
                },
                include: {
                    noteBlocks: true
                },
                orderBy: {
                    updatedAt: 'desc'
                }
            });
        }

        // Proses setiap note untuk mendapatkan document
        const processedNotes = await Promise.all(notes.map(async (note) => {
            // Filter noteBlocks yang bertipe document
            const documentBlocks = note.noteBlocks.filter(block => block.type === BlockType.document);

            // Dapatkan document notes untuk setiap block
            const documentData = await Promise.all(documentBlocks.map(async (block) => {
                if (!block.referenceId) return null;

                // Dapatkan document note
                const documentNote = await this.prisma.documentNote.findFirst({
                    where: {
                        id: block.referenceId,
                        noteId: note.id
                    },
                    include: {
                        document: true
                    }
                });

                if (!documentNote || !documentNote.documentId) return null;

                // Dapatkan document dengan data lengkap
                const document = await this.prisma.document.findUnique({
                    where: { id: documentNote.documentId }
                });

                if (!document) return null;

                return {
                    blockId: block.id,
                    position: block.position,
                    documentNote: documentNote,
                    document: document
                };
            }));

            // Filter out null values dan tambahkan ke note
            const validDocuments = documentData.filter(item => item !== null);

            return {
                ...note,
                documents: validDocuments
            };
        }));

        return processedNotes;
    }
}
