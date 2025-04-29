import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "src/prisma/prisma.service";
import { CreateBoardDto, CreateCardDto, UpdateBoardNameDto, UpdateCardDto, UpdateCardPositionDto, UpdateColumnDto } from "./dto/board.dto";
import { BlockType, Board, BoardCard } from "@prisma/client";
import { Editable } from "@prisma/client";
import { NoteStatus } from "@prisma/client";
import { NoteGateway } from "src/websocket/note.gateway";
import { BoardGateway } from "src/websocket/board.gateway";
import { NoteService } from "src/note/note.service";
@Injectable()
export class BoardService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly noteGateway: NoteGateway,
        private readonly boardGateway: BoardGateway,
        private readonly noteService: NoteService
    ) { }

    async createBoard(data: CreateBoardDto, userId: string) {
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

        const board = await this.prisma.board.create({
            data: {
                sourceNoteId: note.id
            },
        });

        const boardNote = await this.prisma.boardNote.create({
            data: {
                boardId: board.id,
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
                type: BlockType.board,
                referenceId: boardNote.id,
                position: noteBlockOrder ? noteBlockOrder.position + 1 : 1
            }
        })

        await this.noteGateway.sendNoteUpdated(note.id, userId, {
            id: note.id,
            updatedAt: new Date(),
            socketAction: 'addBlock',
            newBlock: noteBlock
        });
        return { board, noteBlock };
    }

    async addRelationBoard(id: string, noteId: string, userId: string) {
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
        const board = await this.prisma.board.findUnique({
            where: {
                id: id,
            },
        });
        if (!board) {
            throw new NotFoundException('Table not found');
        }
        if (board.sourceNoteId === note.id) {
            throw new BadRequestException({
                message: 'board is already related to this note',
                serverCode: 'COMPONENTS_ALREADY_RELATED_TO_NOTE'
            });
        }
        const noteFromBoard = await this.prisma.note.findUnique({
            where: {
                id: board.sourceNoteId
            }
        })
        if (!noteFromBoard) {
            throw new NotFoundException('Note from board not found');
        }
        if (noteFromBoard.status !== NoteStatus.public) {
            throw new BadRequestException({
                message: 'Note from board is must be public',
                serverCode: 'NOTE_NOT_PUBLIC'
            });
        }
        const boardNote = await this.prisma.boardNote.create({
            data: {
                boardId: board.id,
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
                type: BlockType.board,
                referenceId: boardNote.id,
                position: noteBlockOrder ? noteBlockOrder.position + 1 : 1
            }
        })
        await this.noteGateway.sendNoteUpdated(note.id, userId, {
            id: note.id,
            updatedAt: new Date(),
            socketAction: 'addBlock',
            newBlock: noteBlock
        });
        return { board, noteBlock };
    }

    async getBoard(id: string, userId: string, detail?: boolean) {
        const boardNote = await this.prisma.boardNote.findUnique({
            where: {
                id: id,
            },
        });
        if (!boardNote) {
            throw new NotFoundException('board note not found');
        }
        let board: Board | null = null;
        if (boardNote.boardId) {
            board = await this.prisma.board.findUnique({
                where: { id: boardNote.boardId },
            });
        }
        if (!board) {
            throw new NotFoundException('Board not found');
        }
        const note = await this.prisma.note.findUnique({
            where: { id: boardNote.noteId },
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
        const isSourceNote = board.sourceNoteId === note.id;
        if (!isSourceNote) {
            const sourceNote = await this.prisma.note.findUnique({
                where: { id: board.sourceNoteId },
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
                throw new BadRequestException({
                    status: 'error',
                    message: 'cant access board relation. because source note is private or access',
                    serverCode: 'BOARD_RELATION_ACCESS_DENIED'
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

        if (detail) {
            const boardColumns = await this.prisma.boardColumn.findMany({
                where: {
                    boardId: board.id
                },
                include: {
                    cards: {
                        orderBy: {
                            position: 'asc'
                        }
                    }
                }
            });
            return {
                ...board,
                canEdit,
                isSourceNote,
                columns: boardColumns
            }
        }
        return {
            ...board,
            canEdit,
            isSourceNote,
        };
    }

    async updateBoardName(id: string, data: UpdateBoardNameDto, userId: string) {
        const board = await this.prisma.board.findUnique({
            where: { id: id },
        });
        if (!board) {
            throw new NotFoundException('Board not found');
        }

        const note = await this.prisma.note.findUnique({
            where: { id: board.sourceNoteId },
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
        const isSourceNote = board.sourceNoteId === note.id;
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

        const updatedBoard = await this.prisma.board.update({
            where: { id: board.id },
            data: {
                name: data.name
            }
        });

        await this.boardGateway.sendBoardUpdated(board.id, userId, {
            id: board.id,
            name: data.name,
            updatedAt: new Date(),
            socketAction: 'updateBoardName'
        });

        return { message: 'Board name updated successfully' };
    }

    async getBoards(userId: string, filter?: string, sort?: string, noteId?: string) {
        // Dapatkan semua board yang dimiliki user
        let boards: Board[] = [];
        if (filter === 'favorite') {
            boards = await this.prisma.board.findMany({
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
            boards = await this.prisma.board.findMany({
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
                // Dapatkan board yang dimiliki user tapi tidak ada di note tersebut
                boards = await this.prisma.board.findMany({
                    where: {
                        note: {
                            userId,
                            // Exclude boards that are already in this note
                            NOT: {
                                boardNotes: {
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
                boards = await this.prisma.board.findMany({
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

        // Proses setiap board untuk mendapatkan notes yang menggunakannya
        const processedBoards = await Promise.all(boards.map(async (board) => {
            // Dapatkan board notes yang menggunakan board ini
            const boardNotes = await this.prisma.boardNote.findMany({
                where: {
                    boardId: board.id
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

            // Filter notes yang valid (notes yang memiliki block board yang mengacu ke boardNote ini)
            const validNotes = await Promise.all(boardNotes.map(async (boardNote) => {
                // Cari block yang mengacu ke boardNote ini
                const block = await this.prisma.noteBlock.findFirst({
                    where: {
                        noteId: boardNote.noteId,
                        type: BlockType.board,
                        referenceId: boardNote.id
                    }
                });

                if (!block) return null;

                return {
                    ...boardNote.note,
                    blockId: block.id,
                    position: block.position
                };
            }));

            // Filter out null values
            const notes = validNotes.filter(note => note !== null);

            return {
                ...board,
                type: BlockType.board,
                notes: notes
            };
        }));

        return processedBoards;
    }

    async createColumn(id: string, userId: string) {
        const { board, note, canEdit } = await this.getBoardNote(id, userId);

        const lastColumn = await this.prisma.boardColumn.findFirst({
            where: {
                boardId: board.id
            },
            orderBy: {
                position: 'desc'
            }
        });
        const newColumn = await this.prisma.boardColumn.create({
            data: {
                boardId: board.id,
                position: lastColumn ? lastColumn.position + 1 : 1
            },
            include: {
                cards: true
            }
        });
        await this.boardGateway.sendBoardUpdated(board.id, userId, {
            id: board.id,
            newColumn,
            updatedAt: new Date(),
            socketAction: 'createColumn'
        });
        return newColumn;
    }

    async updateColumn(id: string, data: UpdateColumnDto, userId: string) {
        const column = await this.prisma.boardColumn.findUnique({
            where: {
                id: id
            }
        });
        if (!column) {
            throw new NotFoundException('Column not found');
        }
        const { board, note, canEdit } = await this.getBoardNote(column.boardId, userId);

        const updatedColumn = await this.prisma.boardColumn.update({
            where: {
                id: column.id
            },
            data: {
                title: data.title
            }
        });
        await this.boardGateway.sendBoardUpdated(board.id, userId, {
            id: board.id,
            updatedColumn,
            updatedAt: new Date(),
            socketAction: 'updateColumn'
        });
        return updatedColumn;
    }

    async deleteColumn(id: string, userId: string) {
        const column = await this.prisma.boardColumn.findUnique({
            where: {
                id: id
            }
        });
        if (!column) {
            throw new NotFoundException('Column not found');
        }
        const { board, note, canEdit } = await this.getBoardNote(column.boardId, userId);
        const deletedColumn = await this.prisma.boardColumn.delete({
            where: {
                id: column.id
            }
        });    
        // Dapatkan semua kolom yang tersisa dan urutkan berdasarkan posisi
        const remainingColumns = await this.prisma.boardColumn.findMany({
            where: {
                boardId: board.id
            },
            orderBy: {
                position: 'asc'
            }
        });    
        // Update posisi untuk semua kolom yang tersisa
        const updatePositionPromises = remainingColumns.map((col, index) =>
            this.prisma.boardColumn.update({
                where: {
                    id: col.id
                },
                data: {
                    position: index + 1
                }
            })
        );    
        // Jalankan semua update secara parallel
        await Promise.all(updatePositionPromises);        
        await this.boardGateway.sendBoardUpdated(board.id, userId, {
            id: board.id,
            deletedColumn,
            updatedColumns: remainingColumns.map((col, index) => ({
                ...col,
                position: index + 1
            })),
            updatedAt: new Date(),
            socketAction: 'deleteColumn'
        });
        return deletedColumn;
    }

    async createCard(id: string, data: CreateCardDto, userId: string) {
        const { board, note, canEdit } = await this.getBoardNote(id, userId);
        const lastCard = await this.prisma.boardCard.findFirst({
            where: {
                boardColumnId: data.columnId
            },
            orderBy: {
                position: 'desc'
            }
        });
        const newCard = await this.prisma.boardCard.create({
            data: {
                boardColumnId: data.columnId,
                position: lastCard ? lastCard.position + 1 : 1
            }
        });
        await this.boardGateway.sendBoardUpdated(board.id, userId, {
            id: board.id,
            newCard,
            updatedAt: new Date(),
            socketAction: 'createCard'
        });
        return newCard;
    }

    async updateCard(id: string, data: UpdateCardDto, userId: string) {
        const card = await this.prisma.boardCard.findUnique({
            where: {
                id: id
            }
        });
        if (!card) {
            throw new NotFoundException('Card not found');
        }
        const column = await this.prisma.boardColumn.findUnique({
            where: {
                id: card.boardColumnId
            }
        })
        if (!column) {
            throw new NotFoundException('Column not found');
        }
        const { board, note, canEdit } = await this.getBoardNote(column.boardId, userId);
        const updatedCard = await this.prisma.boardCard.update({
            where: {
                id: card.id
            },
            data: {
                title: data.title,
                description: data.description
            }
        });
        await this.boardGateway.sendBoardUpdated(board.id, userId, {
            id: board.id,
            updatedCard,
            updatedAt: new Date(),
            socketAction: 'updateCard'
        });
        return updatedCard;
    }

    async deleteCard(id: string, userId: string) {
        const card = await this.prisma.boardCard.findUnique({
            where: {
                id: id
            }
        });
        if (!card) {
            throw new NotFoundException('Card not found');
        }
        const column = await this.prisma.boardColumn.findUnique({
            where: {
                id: card.boardColumnId
            }
        })
        if (!column) {
            throw new NotFoundException('Column not found');
        }
        const { board, note, canEdit } = await this.getBoardNote(column.boardId, userId);
        const deletedCard = await this.prisma.boardCard.delete({
            where: {
                id: card.id
            }
        });    
        // Dapatkan semua card yang tersisa dalam kolom yang sama
        const remainingCards = await this.prisma.boardCard.findMany({
            where: {
                boardColumnId: card.boardColumnId
            },
            orderBy: {
                position: 'asc'
            }
        });    
        // Update posisi untuk semua card yang tersisa
        const updatePositionPromises = remainingCards.map((c, index) =>
            this.prisma.boardCard.update({
                where: {
                    id: c.id
                },
                data: {
                    position: index + 1
                }
            })
        );    
        // Jalankan semua update secara parallel
        await Promise.all(updatePositionPromises);    
        await this.boardGateway.sendBoardUpdated(board.id, userId, {
            id: board.id,
            deletedCard,
            updatedCards: remainingCards.map((c, index) => ({
                ...c,
                position: index + 1
            })),
            updatedAt: new Date(),
            socketAction: 'deleteCard'
        });
        return deletedCard;
    }

    async updateCardPosition(id: string, data: UpdateCardPositionDto, userId: string) {
        const card = await this.prisma.boardCard.findUnique({
            where: { id }
        });
        if (!card) {
            throw new NotFoundException('Card not found');
        }
        const column = await this.prisma.boardColumn.findUnique({
            where: { id: card.boardColumnId }
        });
        if (!column) {
            throw new NotFoundException('Column not found');
        }
        const { board, note, canEdit } = await this.getBoardNote(column.boardId, userId);
        // Moving to different column
        if (column.id !== data.columnId) {
            const newColumn = await this.prisma.boardColumn.findUnique({
                where: { id: data.columnId }
            });
            if (!newColumn) {
                throw new NotFoundException('New column not found');
            }
            // Get cards in target column
            const cardsInNewColumn = await this.prisma.boardCard.findMany({
                where: { boardColumnId: data.columnId },
                orderBy: { position: 'asc' }
            });
            // Move card to new position in new column
            await this.prisma.boardCard.update({
                where: { id: card.id },
                data: { 
                    boardColumnId: data.columnId,
                    position: data.position 
                }
            });
            // Reorder cards in new column
            const updatedCardsNewColumn = [...cardsInNewColumn];
            updatedCardsNewColumn.splice(data.position - 1, 0, { ...card, boardColumnId: data.columnId });
            
            const updateNewColumnPromises = updatedCardsNewColumn.map((c, index) => 
                this.prisma.boardCard.update({
                    where: { id: c.id },
                    data: { position: index + 1 }
                })
            );
            // Get and reorder cards in original column
            const cardsInOldColumn = await this.prisma.boardCard.findMany({
                where: { 
                    boardColumnId: column.id,
                    NOT: { id: card.id }
                },
                orderBy: { position: 'asc' }
            });
            const updateOldColumnPromises = cardsInOldColumn.map((c, index) => 
                this.prisma.boardCard.update({
                    where: { id: c.id },
                    data: { position: index + 1 }
                })
            );
            await Promise.all([...updateNewColumnPromises, ...updateOldColumnPromises]);
            await this.boardGateway.sendBoardUpdated(board.id, userId, {
                id: board.id,
                updatedCards: {
                    id: card.id,
                    fromColumnId: column.id,
                    toColumnId: data.columnId,
                    oldColumnCards: cardsInOldColumn,
                    newColumnCards: updatedCardsNewColumn
                },
                updatedAt: new Date(),
                socketAction: 'updateCardPositionAndColumn'
            });
        } 
        // Moving within same column
        else {
            const cards = await this.prisma.boardCard.findMany({
                where: { boardColumnId: column.id },
                orderBy: { position: 'asc' }
            });
            // Remove card from current position and insert at new position
            const cardsWithoutMoved = cards.filter(c => c.id !== card.id);
            cardsWithoutMoved.splice(data.position - 1, 0, card);
            // Update all positions
            const updatePromises = cardsWithoutMoved.map((c, index) => 
                this.prisma.boardCard.update({
                    where: { id: c.id },
                    data: { position: index + 1 }
                })
            );
            await Promise.all(updatePromises);

            // Update position in memory for socket data
            const updatedCards = cardsWithoutMoved.map((c, index) => ({
                ...c,
                position: index + 1
            }));

            await this.boardGateway.sendBoardUpdated(board.id, userId, {
                id: board.id,
                columnId: column.id,
                updatedCards,
                updatedAt: new Date(),
                socketAction: 'updateCardPosition'
            });
        }
        return { message: 'Card position updated successfully' };
    }

    private async getBoardNote(boardId: string, userId: string) {
        const board = await this.prisma.board.findUnique({
            where: {
                id: boardId
            }
        });
        if (!board) {
            throw new NotFoundException('Board not found');
        }
        const note = await this.prisma.note.findUnique({
            where: {
                id: board.sourceNoteId
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
            board,
            note,
            canEdit
        };
    }

    async deleteBoard(id: string, userId: string) {
        const boardNote = await this.prisma.boardNote.findUnique({
            where: {
                id: id,
            },
        });
        if (!boardNote) {
            throw new NotFoundException('Board note not found');
        }
        console.log('boardNote: ', boardNote);
        const note = await this.prisma.note.findUnique({
            where: { id: boardNote.noteId },
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
        let board: Board | null = null;
        if (boardNote.boardId) {
            board = await this.prisma.board.findUnique({
                where: { id: boardNote.boardId },
            });
        }
        if (!board) {
            const owner = note.userId === userId;
            if (!owner && (note.status === NoteStatus.private || (note.status === NoteStatus.access && !note.noteEdits.some(edit => edit.userId === userId)))) {
                throw new ForbiddenException('You are not allowed to access this note');
            }
            if (note.editable === Editable.everyone || (note.editable === Editable.access && note.noteEdits.some(edit => edit.userId === userId)) || note.userId === userId) {
                canEdit = true;
            }
            if (!canEdit) {
                throw new ForbiddenException('You are not allowed to delete this board');
            }
            const deletedNoteBlock = await this.prisma.noteBlock.deleteMany({
                where: {
                    referenceId: boardNote.id
                }
            });
            const updatedBlockPosition = await this.noteService.reorderNoteBlocks(note.id);

            const deletedBoardNote = await this.prisma.boardNote.delete({
                where: {
                    id: boardNote.id
                }
            });
            await this.noteGateway.sendNoteUpdated(note.id, userId, {
                id: note.id,
                updatedAt: new Date(),
                socketAction: 'deleteBlock',
                deletedBlock: {
                    id: boardNote.id,
                    referenceId: boardNote.id,
                },
                updatedBlockPosition
            })

            return { message: 'Board relation deleted successfully. but board not found' };
        }
        const isSourceNote = board.sourceNoteId === note.id;
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
                throw new ForbiddenException('You are not allowed to delete this board');
            }
            const deletedNoteBlock = await this.prisma.noteBlock.deleteMany({
                where: {
                    referenceId: boardNote.id
                }
            });

            // Rapihkan posisi note block yang tersisa
            const updatedBlockPosition = await this.noteService.reorderNoteBlocks(note.id);

            const deletedBoardNote = await this.prisma.boardNote.delete({
                where: {
                    id: boardNote.id
                }
            });
            await this.noteGateway.sendNoteUpdated(note.id, userId, {
                id: note.id,
                updatedAt: new Date(),
                socketAction: 'deleteBlock',
                deletedBlock: {
                    id: boardNote.id,
                    referenceId: boardNote.id,
                },
                updatedBlockPosition
            })
            return { message: 'Board relation deleted successfully' };
        }
        const owner = note.userId === userId;
        if (!owner && (note.status === NoteStatus.private || (note.status === NoteStatus.access && !note.noteEdits.some(edit => edit.userId === userId)))) {
            throw new ForbiddenException('You are not allowed to access this note');
        }
        if (note.editable === Editable.everyone || (note.editable === Editable.access && note.noteEdits.some(edit => edit.userId === userId)) || note.userId === userId) {
            canEdit = true;
        }
        if (!canEdit) {
            throw new ForbiddenException('You are not allowed to delete this board');
        }

        const deletedNoteBlock = await this.prisma.noteBlock.deleteMany({
            where: {
                referenceId: boardNote.id
            }
        });

        // Rapihkan posisi note block yang tersisa
        const updatedBlockPosition = await this.noteService.reorderNoteBlocks(note.id);

        const deletedBoardNote = await this.prisma.boardNote.delete({
            where: {
                id: boardNote.id
            }
        });
        const deletedBoard = await this.prisma.board.delete({
            where: { id: board.id }
        });
        await this.noteGateway.sendNoteUpdated(note.id, userId, {
            id: note.id,
            updatedAt: new Date(),
            socketAction: 'deleteBlock',
            deletedBlock: {
                id: boardNote.id,
                referenceId: boardNote.id,
            },
            updatedBlockPosition
        })
        return { message: 'Board deleted successfully' };
    }
}
