import { Body, Controller, Delete, Get, Param, Post, Put, Query } from "@nestjs/common";
import { TableService } from "./table.service";
import { CreateRowDataDto, CreateTableDto, UpdateColDto, UpdateRowDataDto, UpdateTableNameDto } from "./dto/table.dto";
import { UserAccessType } from "src/common/utils/jwt.util";
import { Auth } from "src/common/decorators/user.decorator";

@Controller('table')
export class TableController {
    constructor(private readonly tableService: TableService) { }

    @Post()
    createTable(
        @Body() data: CreateTableDto,
        @Auth() user: UserAccessType
    ) {
        return this.tableService.createTable(data, user.id);
    }

    @Put(':id/title')
    updateNoteTitle(
        @Param('id') id: string,
        @Body() data: UpdateTableNameDto,
        @Auth() user: UserAccessType
    ) {
        return this.tableService.updateTableName(id, data, user.id);
    }

    @Get(':id')
    getTable(
        @Param('id') id: string,
        @Auth() user: UserAccessType,
        @Query() query: { detail?: string }
    ) {
        return this.tableService.getTable(id, user.id, query.detail === 'true');
    }

    @Get()
    getTables(
        @Auth() user: UserAccessType,
        @Query() query: { limit?: number, page?: number, sort?: string, my?: string }

    ) {
        return this.tableService.getTables(user.id, parseInt(query.limit as any), parseInt(query.page as any), (query.sort ?? undefined), (query.my === 'true'));
    }


    @Put('row-data/:id')
    updateRowData(
        @Param('id') id: string,
        @Body() data: UpdateRowDataDto,
        @Auth() user: UserAccessType
    ) {
        return this.tableService.updateRowData(id, data, user.id);
    }

    @Put('col/:id')
    updateCol(
        @Param('id') id: string,
        @Body() data: UpdateColDto,
        @Auth() user: UserAccessType
    ) {
        return this.tableService.updateCol(id, data, user.id);
    }

    @Post(':id/col')
    createCol(
        @Param('id') id: string,
        @Auth() user: UserAccessType
    ) {
        return this.tableService.createCol(id, user.id);
    }

    @Delete('/col/:id')
    deleteCol(
        @Param('id') id: string,
        @Auth() user: UserAccessType
    ) {
        return this.tableService.deleteCol(id, user.id);
    }

    @Post(':id/row')
    createRow(
        @Param('id') id: string,
        @Auth() user: UserAccessType
    ) {
        return this.tableService.createRow(id, user.id);
    }

    @Delete('/row/:id')
    deleteRow(
        @Param('id') id: string,
        @Auth() user: UserAccessType
    ) {
        return this.tableService.deleteRow(id, user.id);
    }

    @Post(':id/row-data')
    createRowData(
        @Param('id') id: string,
        @Body() data: CreateRowDataDto,
        @Auth() user: UserAccessType
    ) {
        return this.tableService.createRowData(id, data, user.id);
    }

    @Delete('row-data/:id')
    deleteRowData(
        @Param('id') id: string,
        @Auth() user: UserAccessType
    ) {
        return this.tableService.deleteRowData(id, user.id);
    }
    

    @Delete(':id')
    deleteTable(
        @Param('id') id: string,
        @Auth() user: UserAccessType
    ) {
        return this.tableService.deleteTable(id, user.id);
    }
}

