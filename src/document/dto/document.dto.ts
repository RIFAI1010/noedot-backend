import { IsNotEmpty, IsNumber, IsOptional, IsString } from "class-validator";

export class CreateDocumentDto {
    @IsNotEmpty()
    @IsString()
    noteId: string;
}


export class UpdateDocumentNameDto {
    @IsNotEmpty()
    @IsString()
    name: string;
}


export class UpdateDocumentContentDto {
    @IsOptional()
    @IsString()
    content: string;
}
export class UpdateDocumentHeightDto {
    @IsOptional()
    @IsNumber()
    height: number;
}