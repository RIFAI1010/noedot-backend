import { MiddlewareConsumer, Module } from "@nestjs/common";
import { NoteController } from "./note.controller";
import { NoteService } from "./note.service";
import { PrismaService } from "src/prisma/prisma.service";
import { AuthMiddleware } from "src/common/middlewares/auth.middleware";
import { ConfigModule } from "@nestjs/config";
import { WebsocketModule } from "src/websocket/websocket.module";

@Module({
    imports: [ConfigModule, WebsocketModule],
    controllers: [NoteController],
    providers: [NoteService, PrismaService],
    exports: [NoteService]
})
export class NoteModule {
    configure(consumer: MiddlewareConsumer) {
        consumer.apply(AuthMiddleware).forRoutes(NoteController);
    }
}