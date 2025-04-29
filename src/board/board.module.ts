import { MiddlewareConsumer, Module } from "@nestjs/common";
import { BoardController } from "./board.controller";
import { BoardService } from "./board.service";
import { AuthMiddleware } from "src/common/middlewares/auth.middleware";
import { ConfigModule } from "@nestjs/config";
import { PrismaService } from "src/prisma/prisma.service";
import { WebsocketModule } from "src/websocket/websocket.module";
import { NoteModule } from "src/note/note.module";

@Module({
    imports: [ConfigModule, WebsocketModule, NoteModule],
    controllers: [BoardController],
    providers: [BoardService, PrismaService],
    exports: [BoardService]
})
export class BoardModule {
    configure(consumer: MiddlewareConsumer) {
        consumer.apply(AuthMiddleware).forRoutes(BoardController);
    }
}