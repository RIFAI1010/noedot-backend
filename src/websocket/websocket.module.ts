import { Module } from '@nestjs/common';
import { VerificationGateway } from './verification.gateway';
import { NoteGateway } from './note.gateway';
import { PrismaService } from 'src/prisma/prisma.service';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import { UserGateway } from './user.gateway';
import { TableGateway } from './table.gateway';
@Module({
    imports: [
        ConfigModule
    ],
    providers: [VerificationGateway, NoteGateway, UserGateway, TableGateway, PrismaService],
    exports: [VerificationGateway, NoteGateway, UserGateway, TableGateway],
})
export class WebsocketModule { }
