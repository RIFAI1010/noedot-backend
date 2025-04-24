import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "src/prisma/prisma.service";
import { CreateRowDataDto, CreateTableDto, UpdateColDto, UpdateRowDataDto, UpdateTableNameDto } from "./dto/table.dto";
import { BlockType, Col, Editable, Note, NoteBlock, NoteStatus, Row, RowData, Table } from "@prisma/client";
import { TableGateway } from "src/websocket/table.gateway";
import { NoteGateway } from "src/websocket/note.gateway";
import { NoteService } from "src/note/note.service";

@Injectable()
export class TableService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly tableGateway: TableGateway,
        private readonly noteGateway: NoteGateway,
        private readonly noteService: NoteService
    ) { }

    async createTable(data: CreateTableDto, userId: string) {
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

        const table = await this.prisma.table.create({
            data: {
                sourceNoteId: note.id
            },
        });

        const tableNote = await this.prisma.tableNote.create({
            data: {
                tableId: table.id,
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
                type: BlockType.table,
                referenceId: tableNote.id,
                position: noteBlockOrder ? noteBlockOrder.position + 1 : 1
            }
        })

        await this.noteGateway.sendNoteUpdated(note.id, userId, {
            id: note.id,
            updatedAt: new Date(),
            socketAction: 'addBlock',
            newBlock: noteBlock
        });
        return { table, noteBlock };
    }

    async addRelationTable(id: string, noteId: string, userId: string) {
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
        const table = await this.prisma.table.findUnique({
            where: {
                id: id,
            },
        });
        if (!table) {
            throw new NotFoundException('Table not found');
        }
        if (table.sourceNoteId === note.id) {
            throw new BadRequestException({
                message: 'Table is already related to this note',
                serverCode: 'COMPONENTS_ALREADY_RELATED_TO_NOTE'
            });
        }
        const noteFromTable = await this.prisma.note.findUnique({
            where: {
                id: table.sourceNoteId
            }
        })
        if (!noteFromTable) {
            throw new NotFoundException('Note from table not found');
        }
        if (noteFromTable.status !== NoteStatus.public) {
            throw new BadRequestException({
                message: 'Note from table is must be public',
                serverCode: 'NOTE_FROM_TABLE_NOT_PUBLIC'
            });
        }
        const tableNote = await this.prisma.tableNote.create({
            data: {
                tableId: table.id,
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
                type: BlockType.table,
                referenceId: tableNote.id,
                position: noteBlockOrder ? noteBlockOrder.position + 1 : 1
            }
        })
        await this.noteGateway.sendNoteUpdated(note.id, userId, {
            id: note.id,
            updatedAt: new Date(),
            socketAction: 'addBlock',
            newBlock: noteBlock
        });
        return { table, noteBlock };
    }

    async getTable(id: string, userId: string, detail?: boolean) {
        const tableNote = await this.prisma.tableNote.findUnique({
            where: {
                id: id,
            },
        });
        if (!tableNote) {
            throw new NotFoundException('Table note not found');
        }
        let table: Table | null = null;
        if (tableNote.tableId) {
            table = await this.prisma.table.findUnique({
                where: { id: tableNote.tableId },
            });
        }
        if (!table) {
            throw new NotFoundException('Table not found');
        }
        const note = await this.prisma.note.findUnique({
            where: { id: tableNote.noteId },
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
        const isSourceNote = table.sourceNoteId === note.id;
        if (!isSourceNote) {
            const sourceNote = await this.prisma.note.findUnique({
                where: { id: table.sourceNoteId },
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
                    message: 'cant access table relation. because source note is private or access',
                    serverCode: 'TABLE_RELATION_ACCESS_DENIED'
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
        let cols: Col[] = [];
        let rows: (Row & { rowData: RowData[] })[] = [];
        if (detail) {
            cols = await this.prisma.col.findMany({
                where: {
                    tableId: table.id
                }
            });
            rows = await this.prisma.row.findMany({
                where: {
                    tableId: table.id
                },
                include: {
                    rowData: true
                }
            });
            return {
                ...table,
                canEdit,
                isSourceNote,
                cols,
                rows
            }
        }

        return {
            ...table,
            canEdit,
            isSourceNote,
        };
    }

    async updateTableName(id: string, data: UpdateTableNameDto, userId: string) {
        // const tableNote = await this.prisma.tableNote.findUnique({
        //     where: {
        //         id: id,
        //     },
        // });
        // if (!tableNote) {
        //     throw new NotFoundException('Table note not found');
        // }

        const table = await this.prisma.table.findUnique({
            where: { id: id },
        });
        if (!table) {
            throw new NotFoundException('Table not found');
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
        });
        let canEdit = false;
        if (!note) {
            throw new NotFoundException('Note not found');
        }
        const isSourceNote = table.sourceNoteId === note.id;
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

        const updatedTable = await this.prisma.table.update({
            where: { id: table.id },
            data: {
                name: data.name
            }
        });

        await this.tableGateway.sendTableUpdated(table.id, userId, {
            id: table.id,
            name: data.name,
            updatedAt: new Date(),
            socketAction: 'updateTableName'
        });

        return { message: 'Table name updated successfully' };
    }

    //     async getTables(userId: string, sort?: string, filter?: string) {
    //         if (filter === 'my') {
    //             const notesWithTables = await this.noteService.getNotesWithSourceTables(userId);
    //             return notesWithTables;
    //         } else {
    //             const tables = await this.prisma.table.findMany({
    //                 where: {
    //                     note: {
    //                         OR: [
    //                             { userId },
    //                             { noteEdits: { some: { userId } }, status: { in: [NoteStatus.access, NoteStatus.public] } }
    //                         ]
    //                     }
    //                 }
    //             });
    // // 
    //         }
    //     }
    // async getTables(userId: string, filter?: string, sort?: string) {
    //     // Dapatkan notes dengan noteblocks
    //     let notes: (Note & { noteBlocks: NoteBlock[] })[] = [];
    //     if (filter === 'favorite') {
    //         notes = await this.prisma.note.findMany({
    //             where: {
    //                 noteUserFavorites: {
    //                     some: {
    //                         userId
    //                     }
    //                 }
    //             },
    //             include: {
    //                 noteBlocks: true
    //             },
    //             orderBy: {
    //                 updatedAt: 'desc'
    //             }
    //         });
    //     } else if (filter === 'shared') {
    //         notes = await this.prisma.note.findMany({
    //             where: {
    //                 noteEdits: {
    //                     some: {
    //                         userId
    //                     }
    //                 },
    //                 status: { in: [NoteStatus.access, NoteStatus.public] }
    //             },
    //             include: {
    //                 noteBlocks: true
    //             },
    //             orderBy: {
    //                 updatedAt: 'desc'
    //             }
    //         });
    //     } else {
    //         notes = await this.prisma.note.findMany({
    //             where: {
    //                 userId
    //             },
    //             include: {
    //                 noteBlocks: true
    //             },
    //             orderBy: {
    //                 updatedAt: 'desc'
    //             }
    //         });
    //     }

    //     // Proses setiap note untuk mendapatkan table asli
    //     const processedNotes = await Promise.all(notes.map(async (note) => {
    //         // Filter noteBlocks yang bertipe table
    //         const tableBlocks = note.noteBlocks.filter(block => block.type === BlockType.table);

    //         // Dapatkan table notes untuk setiap block
    //         const tableData = await Promise.all(tableBlocks.map(async (block) => {
    //             if (!block.referenceId) return null;

    //             // Dapatkan table note
    //             const tableNote = await this.prisma.tableNote.findFirst({
    //                 where: {
    //                     id: block.referenceId,
    //                     noteId: note.id  // Menggunakan noteId sebagai pengganti sourceNoteId
    //                 },
    //                 include: {
    //                     table: true
    //                 }
    //             });

    //             if (!tableNote || !tableNote.tableId) return null;

    //             // Dapatkan table dengan data lengkap
    //             const table = await this.prisma.table.findUnique({
    //                 where: { id: tableNote.tableId },
    //                 include: {
    //                     // cols: true,
    //                     // rows: {
    //                     //     include: {
    //                     //         rowData: true
    //                     //     }
    //                     // }
    //                 }
    //             });

    //             if (!table) return null;

    //             return {
    //                 blockId: block.id,
    //                 position: block.position,
    //                 tableNote: tableNote,
    //                 table: table
    //             };
    //         }));

    //         // Filter out null values dan tambahkan ke note
    //         const validTables = tableData.filter(item => item !== null);

    //         return {
    //             ...note,
    //             tables: validTables
    //         };
    //     }));

    //     return processedNotes;
    // }

    async getTables(userId: string, filter?: string, sort?: string, noteId?: string) {
        // Dapatkan semua table yang dimiliki user
        let tables: Table[] = [];
        if (filter === 'favorite') {
            tables = await this.prisma.table.findMany({
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
            tables = await this.prisma.table.findMany({
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
                // Dapatkan table yang dimiliki user tapi tidak ada di note tersebut
                tables = await this.prisma.table.findMany({
                    where: {
                        note: {
                            userId,
                            // Exclude tables that are already in this note
                            NOT: {
                                tableNotes: {
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
                tables = await this.prisma.table.findMany({
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
        // const tables = await this.prisma.table.findMany({
        //     where: {
        //         userId
        //     },
        //     orderBy: {
        //         updatedAt: 'desc'
        //     }
        // });

        // Proses setiap table untuk mendapatkan notes yang menggunakannya
        const processedTables = await Promise.all(tables.map(async (table) => {
            // Dapatkan table notes yang menggunakan table ini
            const tableNotes = await this.prisma.tableNote.findMany({
                where: {
                    tableId: table.id
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

            // Filter notes yang valid (notes yang memiliki block table yang mengacu ke tableNote ini)
            const validNotes = await Promise.all(tableNotes.map(async (tableNote) => {
                // Cari block yang mengacu ke tableNote ini
                const block = await this.prisma.noteBlock.findFirst({
                    where: {
                        noteId: tableNote.noteId,
                        type: BlockType.table,
                        referenceId: tableNote.id
                    }
                });

                if (!block) return null;

                return {
                    ...tableNote.note,
                    blockId: block.id,
                    position: block.position
                };
            }));

            // Filter out null values
            const notes = validNotes.filter(note => note !== null);

            return {
                ...table,
                type: BlockType.table,
                notes: notes
            };
        }));

        return processedTables;
    }

    async updateRowData(id: string, data: UpdateRowDataDto, userId: string) {
        const rowData = await this.prisma.rowData.findUnique({
            where: {
                id: id
            }
        });
        if (!rowData) {
            throw new NotFoundException('Row data not found');
        }
        const row = await this.prisma.row.findUnique({
            where: {
                id: rowData.rowId
            }
        });
        if (!row) {
            throw new NotFoundException('Row not found');
        }
        const { table, note, canEdit } = await this.getTableNote(row.tableId, userId);

        const updatedRowData = await this.prisma.rowData.update({
            where: {
                id: rowData.id
            },
            data: {
                content: data.content
            }
        });
        await this.tableGateway.sendTableUpdated(table.id, userId, {
            id: table.id,
            updatedRowData,
            updatedAt: new Date(),
            socketAction: 'updateRowData'
        });
        return updatedRowData;
    }

    async updateCol(id: string, data: UpdateColDto, userId: string) {
        const col = await this.prisma.col.findUnique({
            where: {
                id: id
            }
        });
        if (!col) {
            throw new NotFoundException('Col not found');
        }
        const { table, note, canEdit } = await this.getTableNote(col.tableId, userId);

        const updatedCol = await this.prisma.col.update({
            where: {
                id: col.id
            },
            data: {
                title: data.title
            }
        });
        await this.tableGateway.sendTableUpdated(table.id, userId, {
            id: table.id,
            updatedCol,
            updatedAt: new Date(),
            socketAction: 'updateCol'
        });
        return updatedCol;
    }

    async createCol(id: string, userId: string) {
        const { table, note, canEdit } = await this.getTableNote(id, userId);

        const newCol = await this.prisma.col.create({
            data: {
                tableId: table.id,
            }
        });
        await this.tableGateway.sendTableUpdated(table.id, userId, {
            id: table.id,
            newCol,
            updatedAt: new Date(),
            socketAction: 'createCol'
        });
        return newCol;
    }

    async deleteCol(id: string, userId: string) {
        const col = await this.prisma.col.findUnique({
            where: {
                id: id
            }
        });
        if (!col) {
            throw new NotFoundException('Col not found');
        }
        const { table, note, canEdit } = await this.getTableNote(col.tableId, userId);

        const deletedCol = await this.prisma.col.delete({
            where: {
                id: col.id
            }
        });
        await this.tableGateway.sendTableUpdated(table.id, userId, {
            id: table.id,
            deletedCol,
            updatedAt: new Date(),
            socketAction: 'deleteCol'
        });
        return deletedCol;
    }

    async createRow(id: string, userId: string) {
        const { table, note, canEdit } = await this.getTableNote(id, userId);

        const lastRow = await this.prisma.row.findFirst({
            where: {
                tableId: table.id
            },
            orderBy: {
                rowNumber: 'desc'
            }
        });
        const newRow = await this.prisma.row.create({
            data: {
                tableId: table.id,
                rowNumber: lastRow ? lastRow.rowNumber + 1 : 1
            },
            include: {
                rowData: true
            }
        });
        await this.tableGateway.sendTableUpdated(table.id, userId, {
            id: table.id,
            newRow,
            updatedAt: new Date(),
            socketAction: 'createRow'
        });
        return newRow;
    }

    async deleteRow(id: string, userId: string) {
        const row = await this.prisma.row.findUnique({
            where: {
                id: id
            }
        });

        if (!row) {
            throw new NotFoundException('Row not found');
        }

        const { table, note, canEdit } = await this.getTableNote(row.tableId, userId);

        const deletedRow = await this.prisma.row.delete({
            where: {
                id: row.id
            }
        });
        await this.tableGateway.sendTableUpdated(table.id, userId, {
            id: table.id,
            deletedRow,
            updatedAt: new Date(),
            socketAction: 'deleteRow'
        });
        return deletedRow;
    }


    async createRowData(id: string, data: CreateRowDataDto, userId: string) {
        const { table, note, canEdit } = await this.getTableNote(id, userId);

        const rowData = await this.prisma.rowData.create({
            data: {
                rowId: data.rowId,
                colId: data.colId,
                content: data.content
            }
        });
        await this.tableGateway.sendTableUpdated(table.id, userId, {
            id: table.id,
            newRowData: rowData,
            updatedAt: new Date(),
            socketAction: 'createRowData'
        });
        return rowData;
    }

    async deleteRowData(id: string, userId: string) {
        const rowData = await this.prisma.rowData.findUnique({
            where: {
                id: id
            }
        });
        if (!rowData) {
            throw new NotFoundException('Row data not found');
        }
        const row = await this.prisma.row.findUnique({
            where: { id: rowData.rowId }
        })
        if (!row) {
            throw new NotFoundException('Row not found');
        }
        const { table, note, canEdit } = await this.getTableNote(row.tableId, userId);

        const deletedRowData = await this.prisma.rowData.delete({
            where: {
                id: id
            }
        });
        await this.tableGateway.sendTableUpdated(table.id, userId, {
            id: table.id,
            deletedRowData,
            updatedAt: new Date(),
            socketAction: 'deleteRowData'
        });
        return deletedRowData;
    }


    private async getTableNote(tableId: string, userId: string) {
        const table = await this.prisma.table.findUnique({
            where: {
                id: tableId
            }
        });
        if (!table) {
            throw new NotFoundException('Table not found');
        }
        const note = await this.prisma.note.findUnique({
            where: {
                id: table.sourceNoteId
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
            table,
            note,
            canEdit
        };
    }



    async deleteTable(id: string, userId: string) {
        const tableNote = await this.prisma.tableNote.findUnique({
            where: {
                id: id,
            },
        });
        if (!tableNote) {
            throw new NotFoundException('Table note not found');
        }
        console.log('tableNote: ', tableNote);
        const note = await this.prisma.note.findUnique({
            where: { id: tableNote.noteId },
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
        let table: Table | null = null;
        if (tableNote.tableId) {
            table = await this.prisma.table.findUnique({
                where: { id: tableNote.tableId },
            });
        }
        if (!table) {
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
                    referenceId: tableNote.id
                }
            });
            const updatedBlockPosition = await this.noteService.reorderNoteBlocks(note.id);

            const deletedTableNote = await this.prisma.tableNote.delete({
                where: {
                    id: tableNote.id
                }
            });
            await this.noteGateway.sendNoteUpdated(note.id, userId, {
                id: note.id,
                updatedAt: new Date(),
                socketAction: 'deleteBlock',
                deletedBlock: {
                    id: tableNote.id,
                    referenceId: tableNote.id,
                },
                updatedBlockPosition
            })

            return { message: 'Table relation deleted successfully. but table not found' };
        }
        const isSourceNote = table.sourceNoteId === note.id;
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
                    referenceId: tableNote.id
                }
            });

            // Rapihkan posisi note block yang tersisa
            const updatedBlockPosition = await this.noteService.reorderNoteBlocks(note.id);

            const deletedTableNote = await this.prisma.tableNote.delete({
                where: {
                    id: tableNote.id
                }
            });
            await this.noteGateway.sendNoteUpdated(note.id, userId, {
                id: note.id,
                updatedAt: new Date(),
                socketAction: 'deleteBlock',
                deletedBlock: {
                    id: tableNote.id,
                    referenceId: tableNote.id,
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
                referenceId: tableNote.id
            }
        });

        // Rapihkan posisi note block yang tersisa
        const updatedBlockPosition = await this.noteService.reorderNoteBlocks(note.id);

        const deletedTableNote = await this.prisma.tableNote.delete({
            where: {
                id: tableNote.id
            }
        });
        const deletedTable = await this.prisma.table.delete({
            where: { id: table.id }
        });
        await this.noteGateway.sendNoteUpdated(note.id, userId, {
            id: note.id,
            updatedAt: new Date(),
            socketAction: 'deleteBlock',
            deletedBlock: {
                id: tableNote.id,
                referenceId: tableNote.id,
            },
            updatedBlockPosition
        })
        return { message: 'Table deleted successfully' };
    }

}
