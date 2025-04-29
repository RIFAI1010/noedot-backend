import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "src/prisma/prisma.service";
import { CreateDocumentDto, UpdateDocumentContentDto, UpdateDocumentHeightDto, UpdateDocumentNameDto } from "./dto/document.dto";
import { BlockType, Document, Editable, Note, NoteBlock, NoteStatus } from "@prisma/client";
import { NoteGateway } from "src/websocket/note.gateway";
import { NoteService } from "src/note/note.service";
import { DocumentGateway } from "src/websocket/document.gateway";

@Injectable()
export class DocumentService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly documentGateway: DocumentGateway,
        private readonly noteGateway: NoteGateway,
        private readonly noteService: NoteService
    ) { }

    async createDocument(data: CreateDocumentDto, userId: string) {
        const note = await this.prisma.note.findUnique({
            where: {
                id: data.noteId,
            },
            include: {
                noteEdits: {
                    select: {
                        userId: true,
                        user: {
                            select: {
                                id: true,
                            }
                        }
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

        const document = await this.prisma.document.create({
            data: {
                sourceNoteId: note.id
            },
        });

        const documentNote = await this.prisma.documentNote.create({
            data: {
                documentId: document.id,
                noteId: note.id
            }
        })

        const noteBlockOrder = await this.prisma.noteBlock.findFirst({
            where: {
                noteId: note.id,
            },
            orderBy: {
                position: 'desc'
            }
        })
        const noteBlock = await this.prisma.noteBlock.create({
            data: {
                noteId: note.id,
                type: BlockType.document,
                referenceId: documentNote.id,
                position: noteBlockOrder ? noteBlockOrder.position + 1 : 1
            }
        })

        await this.noteGateway.sendNoteUpdated(note.id, userId, {
            id: note.id,
            updatedAt: new Date(),
            socketAction: 'addBlock',
            newBlock: noteBlock
        });
        return { document, noteBlock };
    }

    async addRelationDocument(id: string, noteId: string, userId: string) {
        const note = await this.prisma.note.findUnique({
            where: {
                id: noteId,
            },
            include: {
                noteEdits: {
                    select: {
                        userId: true,
                        user: {
                            select: {
                                id: true,
                            }
                        }
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
        const document = await this.prisma.document.findUnique({
            where: {
                id: id,
            },
        });
        if (!document) {
            throw new NotFoundException('Document not found');
        }
        if (document.sourceNoteId === note.id) {
            throw new BadRequestException({
                message: 'Document is already related to this note',
                serverCode: 'COMPONENTS_ALREADY_RELATED_TO_NOTE'
            });
        }
        const noteFromDocument = await this.prisma.note.findUnique({
            where: {
                id: document.sourceNoteId
            }
        })
        if (!noteFromDocument) {
            throw new NotFoundException('Note from document not found');
        }
        if (noteFromDocument.status !== NoteStatus.public) {
            throw new BadRequestException({
                message: 'Note document table is must be public',
                serverCode: 'NOTE_NOT_PUBLIC'
            });
        }
        const documentNote = await this.prisma.documentNote.create({
            data: {
                documentId: document.id,
                noteId: note.id
            }
        })
        const noteBlockOrder = await this.prisma.noteBlock.findFirst({
            where: {
                noteId: note.id,
            },
            orderBy: {
                position: 'desc'
            }
        })
        const noteBlock = await this.prisma.noteBlock.create({
            data: {
                noteId: note.id,
                type: BlockType.document,
                referenceId: documentNote.id,
                position: noteBlockOrder ? noteBlockOrder.position + 1 : 1
            }
        })

        await this.noteGateway.sendNoteUpdated(note.id, userId, {
            id: note.id,
            updatedAt: new Date(),
            socketAction: 'addBlock',
            newBlock: noteBlock
        });
        return { document, noteBlock };
    }

    async getDocument(id: string, userId: string, detail?: boolean) {
        const documentNote = await this.prisma.documentNote.findUnique({
            where: {
                id: id,
            },
        });
        if (!documentNote) {
            throw new NotFoundException('Document note not found');
        }
        let document: Document | null = null;
        if (documentNote.documentId) {
            document = await this.prisma.document.findUnique({
                where: { id: documentNote.documentId },
            });
        }
        if (!document) {
            throw new NotFoundException('Document not found');
        }
        const note = await this.prisma.note.findUnique({
            where: { id: documentNote.noteId },
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
        const isSourceNote = document.sourceNoteId === note.id;
        if (!isSourceNote) {
            const sourceNote = await this.prisma.note.findUnique({
                where: { id: document.sourceNoteId },
                include: {
                    noteEdits: {
                        select: {
                            userId: true,
                        }
                    }
                }
            });
            if (!sourceNote) {
                throw new NotFoundException('Note not found');
            }
            const owner = sourceNote.userId === userId;
            if (!owner && (sourceNote.status === NoteStatus.private || (sourceNote.status === NoteStatus.access && !sourceNote.noteEdits.some(edit => edit.userId === userId)))) {
                // throw new ForbiddenException('You are not allowed to access this note');
                // return {
                //     status: 'error',
                //     message: 'You are not allowed to access this note',
                //     serverCode: 'TABLE_RELATION_ACCESS_DENIED'
                // }
                throw new BadRequestException({
                    status: 'error',
                    message: 'cant access document relation. because source note is private or access',
                    serverCode: 'DOCUMENT_RELATION_ACCESS_DENIED'
                });
            }
        }
        const owner = note.userId === userId;
        if (!owner && (note.status === NoteStatus.private || (note.status === NoteStatus.access && !note.noteEdits.some(edit => edit.userId === userId)))) {
            throw new ForbiddenException('You are not allowed to access this note');
        }
        if (note.editable === Editable.everyone || (note.editable === Editable.access && note.noteEdits.some(edit => edit.userId === userId)) || note.userId === userId) {
            canEdit = true;
        }
        if (!isSourceNote) {
            canEdit = false;
        }
        return {
            ...document,
            canEdit,
            isSourceNote,
        };
    }

    async updateDocumentName(id: string, data: UpdateDocumentNameDto, userId: string) {

        const document = await this.prisma.document.findUnique({
            where: { id: id },
        });
        if (!document) {
            throw new NotFoundException('Document not found');
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
        });
        let canEdit = false;
        if (!note) {
            throw new NotFoundException('Note not found');
        }
        const isSourceNote = document.sourceNoteId === note.id;
        if (!isSourceNote) {
            throw new ForbiddenException('You are not allowed to edit this note');
        }
        const owner = note.userId === userId;
        if (!owner && (note.status === NoteStatus.private || (note.status === NoteStatus.access && !note.noteEdits.some(edit => edit.userId === userId)))) {
            throw new ForbiddenException('You are not allowed to access this note');
        }
        if (note.editable === Editable.everyone || (note.editable === Editable.access && note.noteEdits.some(edit => edit.userId === userId)) || note.userId === userId) {
            canEdit = true;
        }

        const updatedDocument = await this.prisma.document.update({
            where: { id: document.id },
            data: {
                name: data.name
            }
        });

        await this.documentGateway.sendDocumentUpdated(document.id, userId, {
            id: document.id,
            name: data.name,
            updatedAt: new Date(),
            socketAction: 'updateDocumentName'
        });

        return { message: 'Document name updated successfully' };
    }

    async getDocuments(userId: string, filter?: string, sort?: string, noteId?: string) {
        // Dapatkan semua table yang dimiliki user
        let documents: Document[] = [];
        if (filter === 'favorite') {
            documents = await this.prisma.document.findMany({
                where: {
                    note: {
                        noteUserFavorites: {
                            some: {
                                userId
                            }
                        }
                    }
                },
                orderBy: {
                    updatedAt: 'desc'
                }
            });
        } else if (filter === 'shared') {
            documents = await this.prisma.document.findMany({
                where: {
                    note: {
                        noteEdits: {
                            some: {
                                userId
                            }
                        },
                        status: { in: [NoteStatus.access, NoteStatus.public] }
                    }
                },
                orderBy: {
                    updatedAt: 'desc'
                }
            });
        } else {
            if (noteId) {
                // Dapatkan document yang dimiliki user tapi tidak ada di note tersebut
                documents = await this.prisma.document.findMany({
                    where: {
                        note: {
                            userId,
                            // Exclude tables that are already in this note
                            NOT: {
                                documentNotes: {
                                    some: {
                                        noteId: noteId
                                    }
                                }
                            }
                        }
                    },
                    orderBy: {
                        updatedAt: 'desc'
                    }
                });
            } else {
                documents = await this.prisma.document.findMany({
                    where: {
                        note: {
                            userId
                        }
                    },
                    orderBy: {
                        updatedAt: 'desc'
                    }
                });
            }
        }

        // Proses setiap table untuk mendapatkan notes yang menggunakannya
        const processedDocuments = await Promise.all(documents.map(async (document) => {
            // Dapatkan table notes yang menggunakan table ini
            const documentNotes = await this.prisma.documentNote.findMany({
                where: {
                    documentId: document.id
                },
                include: {
                    note: {
                        include: {
                            noteBlocks: true,
                            user: {
                                select: {
                                    id: true,
                                    name: true,
                                }
                            }
                        }
                    },
                }
            });

            // Filter notes yang valid (notes yang memiliki block document yang mengacu ke documentNote ini)
            const validNotes = await Promise.all(documentNotes.map(async (documentNote) => {
                // Cari block yang mengacu ke documentNote ini
                const block = await this.prisma.noteBlock.findFirst({
                    where: {
                        noteId: documentNote.noteId,
                        type: BlockType.document,
                        referenceId: documentNote.id
                    }
                });

                if (!block) return null;

                return {
                    ...documentNote.note,
                    blockId: block.id,
                    position: block.position
                };
            }));

            // Filter out null values
            const notes = validNotes.filter(note => note !== null);

            return {
                ...document,
                type: BlockType.document,
                notes: notes
            };
        }));

        return processedDocuments;
    }

    async updateDocumentContent(id: string, data: UpdateDocumentContentDto, userId: string) {
        const { document, note, canEdit } = await this.getDocumentNote(id, userId);

        const updatedDocument = await this.prisma.document.update({
            where: {
                id: document.id
            },
            data: {
                content: data.content
            }
        });
        await this.documentGateway.sendDocumentUpdated(document.id, userId, {
            id: document.id,
            updatedAt: new Date(),
            socketAction: 'updateDocumentContent',
            content: updatedDocument.content
        });
        return updatedDocument;
    }

    async updateDocumentHeight(id: string, data: UpdateDocumentHeightDto, userId: string) {
        const { document, note, canEdit } = await this.getDocumentNote(id, userId);

        const updatedDocument = await this.prisma.document.update({
            where: { id: document.id },
            data: {
                height: data.height
            }
        });
        await this.documentGateway.sendDocumentUpdated(document.id, userId, {
            id: document.id,
            updatedAt: new Date(),
            socketAction: 'updateDocumentHeight',
            height: updatedDocument.height
        });
        return updatedDocument;
    }

    private async getDocumentNote(documentId: string, userId: string) {
        const document = await this.prisma.document.findUnique({
            where: {
                id: documentId
            }
        });
        if (!document) {
            throw new NotFoundException('Document not found');
        }
        const note = await this.prisma.note.findUnique({
            where: {
                id: document.sourceNoteId
            },
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
        let canEdit = false;
        if (note.editable === Editable.everyone || (note.editable === Editable.access && note.noteEdits.some(edit => edit.userId === userId)) || note.userId === userId) {
            canEdit = true;
        }
        if (!canEdit) {
            throw new ForbiddenException('You are not allowed to edit this note');
        }
        return {
            document,
            note,
            canEdit
        };
    }

    async deleteDocument(id: string, userId: string) {
        const documentNote = await this.prisma.documentNote.findUnique({
            where: {
                id: id,
            },
        });
        if (!documentNote) {
            throw new NotFoundException('Document note not found');
        }
        console.log('documentNote: ', documentNote);
        const note = await this.prisma.note.findUnique({
            where: { id: documentNote.noteId },
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
        let document: Document | null = null;
        if (documentNote.documentId) {
            document = await this.prisma.document.findUnique({
                where: { id: documentNote.documentId },
            });
        }
        if (!document) {
            const owner = note.userId === userId;
            if (!owner && (note.status === NoteStatus.private || (note.status === NoteStatus.access && !note.noteEdits.some(edit => edit.userId === userId)))) {
                throw new ForbiddenException('You are not allowed to access this note');
            }
            if (note.editable === Editable.everyone || (note.editable === Editable.access && note.noteEdits.some(edit => edit.userId === userId)) || note.userId === userId) {
                canEdit = true;
            }
            if (!canEdit) {
                throw new ForbiddenException('You are not allowed to delete this table');
            }
            const deletedNoteBlock = await this.prisma.noteBlock.deleteMany({
                where: {
                    referenceId: documentNote.id
                }
            });
            const updatedBlockPosition = await this.noteService.reorderNoteBlocks(note.id);

            const deletedDocumentNote = await this.prisma.documentNote.delete({
                where: {
                    id: documentNote.id
                }
            });
            await this.noteGateway.sendNoteUpdated(note.id, userId, {
                id: note.id,
                updatedAt: new Date(),
                socketAction: 'deleteBlock',
                deletedBlock: {
                    id: documentNote.id,
                    referenceId: documentNote.id,
                },
                updatedBlockPosition
            })

            return { message: 'Document relation deleted successfully. but document not found' };
        }
        const isSourceNote = document.sourceNoteId === note.id;
        if (!isSourceNote) {
            const relationNote = await this.prisma.note.findUnique({
                where: { id: note.id },
                include: {
                    noteEdits: {
                        select: {
                            userId: true,
                        }
                    }
                }
            });
            if (!relationNote) {
                throw new NotFoundException('Note not found');
            }
            const owner = relationNote.userId === userId;
            if (!owner && (relationNote.status === NoteStatus.private || (relationNote.status === NoteStatus.access && !relationNote.noteEdits.some(edit => edit.userId === userId)))) {
                throw new ForbiddenException('You are not allowed to access this note');
            }
            if (relationNote.editable === Editable.everyone || (relationNote.editable === Editable.access && relationNote.noteEdits.some(edit => edit.userId === userId)) || relationNote.userId === userId) {
                canEdit = true;
            }
            if (!canEdit) {
                throw new ForbiddenException('You are not allowed to delete this table');
            }
            const deletedNoteBlock = await this.prisma.noteBlock.deleteMany({
                where: {
                    referenceId: documentNote.id
                }
            });

            // Rapihkan posisi note block yang tersisa
            const updatedBlockPosition = await this.noteService.reorderNoteBlocks(note.id);

            const deletedDocumentNote = await this.prisma.documentNote.delete({
                where: {
                    id: documentNote.id
                }
            });
            await this.noteGateway.sendNoteUpdated(note.id, userId, {
                id: note.id,
                updatedAt: new Date(),
                socketAction: 'deleteBlock',
                deletedBlock: {
                    id: documentNote.id,
                    referenceId: documentNote.id,
                },
                updatedBlockPosition
            })
            return { message: 'Table relation deleted successfully' };
        }
        const owner = note.userId === userId;
        if (!owner && (note.status === NoteStatus.private || (note.status === NoteStatus.access && !note.noteEdits.some(edit => edit.userId === userId)))) {
            throw new ForbiddenException('You are not allowed to access this note');
        }
        if (note.editable === Editable.everyone || (note.editable === Editable.access && note.noteEdits.some(edit => edit.userId === userId)) || note.userId === userId) {
            canEdit = true;
        }
        if (!canEdit) {
            throw new ForbiddenException('You are not allowed to delete this table');
        }

        const deletedNoteBlock = await this.prisma.noteBlock.deleteMany({
            where: {
                referenceId: documentNote.id
            }
        });

        // Rapihkan posisi note block yang tersisa
        const updatedBlockPosition = await this.noteService.reorderNoteBlocks(note.id);

        const deletedDocumentNote = await this.prisma.documentNote.delete({
            where: {
                id: documentNote.id
            }
        });
        const deletedDocument = await this.prisma.document.delete({
            where: { id: document.id }
        });
        await this.noteGateway.sendNoteUpdated(note.id, userId, {
            id: note.id,
            updatedAt: new Date(),
            socketAction: 'deleteBlock',
            deletedBlock: {
                id: documentNote.id,
                referenceId: documentNote.id,
            },
            updatedBlockPosition
        })
        return { message: 'Document deleted successfully' };
    }
}
