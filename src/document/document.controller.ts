import { Body, Controller, Delete, Get, Param, Post, Put, Query } from "@nestjs/common";
import { CreateDocumentDto, UpdateDocumentContentDto, UpdateDocumentNameDto, UpdateDocumentHeightDto } from "./dto/document.dto";
import { UserAccessType } from "src/common/utils/jwt.util";
import { Auth } from "src/common/decorators/user.decorator";
import { DocumentService } from "./document.service";

@Controller('document')
export class DocumentController {
    constructor(private readonly documentService: DocumentService) { }

    @Post()
    createDocument(
        @Body() data: CreateDocumentDto,
        @Auth() user: UserAccessType
    ) {
        return this.documentService.createDocument(data, user.id);
    }

    @Post(':id/relation/:noteId')
    addRelationDocument(
        @Param('id') id: string,
        @Param('noteId') noteId: string,
        @Auth() user: UserAccessType
    ) {
        return this.documentService.addRelationDocument(id, noteId, user.id);
    }

    @Put(':id/title')
    updateDocumentName(
        @Param('id') id: string,
        @Body() data: UpdateDocumentNameDto,
        @Auth() user: UserAccessType
    ) {
        return this.documentService.updateDocumentName(id, data, user.id);
    }

    @Get(':id')
    getDocument(
        @Param('id') id: string,
        @Auth() user: UserAccessType,
        @Query() query: { detail?: string }
    ) {
        return this.documentService.getDocument(id, user.id, query.detail === 'true');
    }

    @Get()
    getDocuments(
        @Auth() user: UserAccessType,
        @Query() query: { sort?: string, filter?: string, noteId?: string }

    ) {
        return this.documentService.getDocuments(user.id, (query.filter ?? undefined), (query.sort ?? undefined), (query.noteId ?? undefined));
    }

    @Put('/:id/content')
    updateDocumentContent(
        @Param('id') id: string,
        @Body() data: UpdateDocumentContentDto,
        @Auth() user: UserAccessType
    ) {
        return this.documentService.updateDocumentContent(id, data, user.id);
    }

    @Put('/:id/height')
    updateDocumentHeight(
        @Param('id') id: string,
        @Body() data: UpdateDocumentHeightDto,
        @Auth() user: UserAccessType
    ) {
        return this.documentService.updateDocumentHeight(id, data, user.id);
    }

    @Delete(':id')
    deleteDocument(
        @Param('id') id: string,
        @Auth() user: UserAccessType
    ) {
        return this.documentService.deleteDocument(id, user.id);
    }
}

