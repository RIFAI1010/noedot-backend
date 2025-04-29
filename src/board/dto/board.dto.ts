import { IsNotEmpty, IsNumber, IsOptional, IsString } from "class-validator";

export class CreateBoardDto {
    @IsNotEmpty()
    @IsString()
    noteId: string;
}

export class UpdateBoardNameDto {
    @IsNotEmpty()
    @IsString()
    name: string;
}

export class UpdateColumnDto {
    @IsOptional()
    @IsString()
    title: string;
}

export class UpdateCardDto {
    @IsOptional()
    @IsString()
    title: string;

    @IsOptional()
    @IsString()
    description: string;
}

export class UpdateCardPositionDto {
    @IsNotEmpty()
    @IsNumber()
    position: number;

    @IsNotEmpty()
    @IsString()
    columnId: string;
}

export class CreateCardDto {
    @IsNotEmpty()
    @IsString()
    columnId: string;
    
}
