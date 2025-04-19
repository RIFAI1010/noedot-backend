import { IsNotEmpty, IsOptional, IsString } from "class-validator";

export class CreateTableDto {

    @IsNotEmpty()
    @IsString()
    noteId: string;
}


export class UpdateTableNameDto {
    @IsNotEmpty()
    @IsString()
    name: string;
}


export class UpdateRowDataDto {
    @IsOptional()
    @IsString()
    content: string;
}

export class UpdateColDto {
    @IsOptional()
    @IsString()
    title: string;
}

export class CreateRowDataDto {
    @IsNotEmpty()
    @IsString()
    rowId: string;

    @IsNotEmpty()
    @IsString()
    colId: string;

    @IsOptional()
    @IsString()
    content: string;
}


