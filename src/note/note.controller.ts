import { Body, Controller, Get, Param, Post, Put, Query } from "@nestjs/common";
import { NoteService } from "./note.service";
import { CreateNoteDto, UpdateNoteDto, UpdateNoteTitleDto } from "./dto/note.dto";
import { UserAccessType } from "src/common/utils/jwt.util";
import { Auth } from "src/common/decorators/user.decorator";


@Controller('note')
export class NoteController {
    constructor(private readonly noteService: NoteService) { }

    @Post()
    createNote(
        @Body() data: CreateNoteDto,
        @Auth() user: UserAccessType
    ) {
        return this.noteService.createNote(data, user.id);
    }

    @Put(':id')
    updateNote(
        @Param('id') id: string,
        @Body() data: UpdateNoteDto,
        @Auth() user: UserAccessType
    ) {
        return this.noteService.updateNote(id, data, user.id);
    }
    @Put(':id/title')
    updateNoteTitle(
        @Param('id') id: string,
        @Body() data: UpdateNoteTitleDto,
        @Auth() user: UserAccessType
    ) {
        return this.noteService.updateNoteTitle(id, data, user.id);
    }

    @Get()
    getNotes(
        @Auth() user: UserAccessType,
        @Query() query: { limit?: number, page?: number, sort?: string, my?: string }
    ) {
        return this.noteService.getNotes(user.id, parseInt(query.limit as any), parseInt(query.page as any), (query.sort ?? undefined), (query.my === 'true'));
    }

    @Get(':id')
    getNote(
        @Auth() user: UserAccessType,
        @Param('id') id: string
    ) {
        return this.noteService.getNote(user.id, id);
    }

    @Get(':id/blocks')
    getNoteBlocks(
        @Auth() user: UserAccessType,
        @Param('id') id: string
    ) {
        return this.noteService.getNoteBlocks(id, user.id);
    }
}