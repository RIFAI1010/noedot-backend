import { Body, Controller, Delete, Get, Param, Post, Put, Query } from "@nestjs/common";
import { NoteService } from "./note.service";
import { CreateNoteDto, UpdateBlockPositionDto, UpdateNoteDto, UpdateNoteTagDto, UpdateNoteTitleDto } from "./dto/note.dto";
import { UserAccessType } from "src/common/utils/jwt.util";
import { Auth } from "src/common/decorators/user.decorator";
import { NoteTag } from "@prisma/client";


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
    @Put(':id/tag')
    updateNoteTag(
        @Param('id') id: string,
        @Body() data: UpdateNoteTagDto,
        @Auth() user: UserAccessType
    ) {
        return this.noteService.updateNoteTag(id, data, user.id);
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
        @Query() query: { sort?: string, filter?: string, tag: NoteTag }
    ) {
        return this.noteService.getNotes(user.id, (query.filter ?? undefined), (query.sort ?? undefined), (query.tag ?? undefined));
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
    
    @Put(':id/block/:blockId/position')
    updateBlockPosition(
        @Param('id') id: string,
        @Param('blockId') blockId: string,
        @Body() data: UpdateBlockPositionDto,
        @Auth() user: UserAccessType
    ) {
        return this.noteService.updateBlockPosition(id, blockId, data.direction, user.id);
    }

    @Post(':id/favorite')
    favoriteNote(
        @Param('id') id: string,
        @Auth() user: UserAccessType
    ) {
        return this.noteService.favoriteNote(id, user.id);
    }

    @Delete(':id/favorite')
    unfavoriteNote(
        @Param('id') id: string,
        @Auth() user: UserAccessType
    ) {
        return this.noteService.unfavoriteNote(id, user.id);
    }
}