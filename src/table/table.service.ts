import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "src/prisma/prisma.service";
import { CreateRowDataDto, CreateTableDto, UpdateColDto, UpdateRowDataDto, UpdateTableNameDto } from "./dto/table.dto";
import { BlockType, Col, Editable, NoteStatus, Row, RowData, Table } from "@prisma/client";
import { TableGateway } from "src/websocket/table.gateway";
import { NoteGateway } from "src/websocket/note.gateway";


@Injectable()
export class TableService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly tableGateway: TableGateway,
        private readonly noteGateway: NoteGateway
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
        return {table, noteBlock};
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

    async getTables(userId: string, limit: number, page: number, sort?: string, my?: boolean) {
        if (my) {
            const tables = await this.prisma.table.findMany({
                where: {
                    note: {
                        userId
                    }
                }
            });
        } else {
            const tables = await this.prisma.table.findMany({
                where: {
                    note: {
                        OR: [
                            { userId },
                            { noteEdits: { some: { userId } }, status: { in: [NoteStatus.access, NoteStatus.public] } }
                        ]
                    }
                }
            });
// 
        }
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
                data: { position: i + 1 }
            });
            remainingBlocks[i].position = i + 1;
        }

        return remainingBlocks.map(block => block.position);
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
            const updatedBlockPosition = await this.reorderNoteBlocks(note.id);
            
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
        const updatedBlockPosition = await this.reorderNoteBlocks(note.id);
        
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
