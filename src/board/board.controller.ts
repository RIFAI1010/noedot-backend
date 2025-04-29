import { Body, Controller, Delete, Get, Param, Post, Put, Query } from "@nestjs/common";
import { BoardService } from "./board.service";
import { CreateBoardDto, CreateCardDto, UpdateBoardNameDto, UpdateCardDto, UpdateCardPositionDto, UpdateColumnDto } from "./dto/board.dto";
import { UserAccessType } from "src/common/utils/jwt.util";
import { Auth } from "src/common/decorators/user.decorator";

@Controller('board')
export class BoardController {
    constructor(private readonly boardService: BoardService) { }

    @Post()
    createBoard(
        @Body() data: CreateBoardDto,
        @Auth() user: UserAccessType
) {
        return this.boardService.createBoard(data, user.id);
    }

    @Post(':id/relation/:noteId')
    addRelationBoard(
        @Param('id') id: string,
        @Param('noteId') noteId: string,
        @Auth() user: UserAccessType
    ) {
        return this.boardService.addRelationBoard(id, noteId, user.id);
    }

    @Put(':id/title')
    updateTableName(
        @Param('id') id: string,
        @Body() data: UpdateBoardNameDto,
        @Auth() user: UserAccessType
    ) {
        return this.boardService.updateBoardName(id, data, user.id);
    }

    @Get(':id')
    getTable(
        @Param('id') id: string,
        @Auth() user: UserAccessType,
        @Query() query: { detail?: string }
    ) {
        return this.boardService.getBoard(id, user.id, query.detail === 'true');
    }

    @Get()
    getBoards(
        @Auth() user: UserAccessType,
        @Query() query: { sort?: string, filter?: string, noteId?: string }

    ) {
        return this.boardService.getBoards(user.id, (query.filter ?? undefined), (query.sort ?? undefined), (query.noteId ?? undefined));
    }



    @Post(':id/column')
    createColumn(
        @Param('id') id: string,
        @Auth() user: UserAccessType
    ) {
        return this.boardService.createColumn(id, user.id);
    }

    @Put('/column/:id')
    updateColumn(
        @Param('id') id: string,
        @Body() data: UpdateColumnDto,
        @Auth() user: UserAccessType
    ) {
        return this.boardService.updateColumn(id, data, user.id);
    }

    @Delete('column/:id')
    deleteColumn(
        @Param('id') id: string,
        @Auth() user: UserAccessType
    ) {
        return this.boardService.deleteColumn(id, user.id);
    }

    @Post(':id/card')
    createCard(
        @Param('id') id: string,
        @Body() data: CreateCardDto,
        @Auth() user: UserAccessType
    ) {
        return this.boardService.createCard(id, data, user.id);
    }

    @Put('/card/:id')
    updateCard(
        @Param('id') id: string,
        @Body() data: UpdateCardDto,
        @Auth() user: UserAccessType
    ) {
        return this.boardService.updateCard(id, data, user.id);
    }

    @Put('/card/:id/position')
    updateCardPosition(
        @Param('id') id: string,
        @Body() data: UpdateCardPositionDto,
        @Auth() user: UserAccessType
    ) {
        return this.boardService.updateCardPosition(id, data, user.id);
    }

    @Delete('card/:id')
    deleteCard(
        @Param('id') id: string,
        @Auth() user: UserAccessType
    ) {
        return this.boardService.deleteCard(id, user.id);
    }
    

    

    @Delete(':id')
    deleteBoard(
        @Param('id') id: string,
        @Auth() user: UserAccessType
    ) {
        return this.boardService.deleteBoard(id, user.id);
    }
}