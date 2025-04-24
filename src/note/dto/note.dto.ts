import { Editable, NoteStatus, NoteTag } from "@prisma/client";
import { IsArray, IsEnum, isNotEmpty, IsNotEmpty, IsOptional, IsString } from "class-validator";

export class CreateNoteDto {
    @IsNotEmpty()
    @IsString()
    title: string;
    
    @IsNotEmpty()
    @IsEnum(NoteStatus)
    status?: NoteStatus;

    @IsNotEmpty()
    @IsEnum(Editable)
    editable: Editable;

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    userAccess?: string[];
}


export class UpdateNoteDto {
    @IsNotEmpty()
    @IsString()
    title: string;

    @IsNotEmpty()
    @IsEnum(NoteStatus)
    status: NoteStatus;

    @IsNotEmpty()
    @IsEnum(Editable)
    editable: Editable;

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    userAccess?: string[];
}

export class UpdateNoteTagDto {
    @IsNotEmpty()
    @IsEnum(NoteTag)
    tag: NoteTag;
}

export class UpdateNoteTitleDto {
    @IsNotEmpty()
    @IsString()
    title: string;
}

export enum Direction {
    UP = 'UP',
    DOWN = 'DOWN'
}

export class UpdateBlockPositionDto {
    @IsNotEmpty()
    @IsEnum(Direction)
    direction: Direction;
}