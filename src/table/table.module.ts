import { MiddlewareConsumer, Module } from "@nestjs/common";
import { TableController } from "./table.controller";
import { TableService } from "./table.service";
import { AuthMiddleware } from "src/common/middlewares/auth.middleware";
import { ConfigModule } from "@nestjs/config";
import { PrismaService } from "src/prisma/prisma.service";
import { WebsocketModule } from "src/websocket/websocket.module";
import { NoteModule } from "src/note/note.module";

@Module({
    imports: [ConfigModule, WebsocketModule, NoteModule],
    controllers: [TableController],
    providers: [TableService, PrismaService],
    exports: [TableService]
})
export class TableModule {
    configure(consumer: MiddlewareConsumer) {
        consumer.apply(AuthMiddleware).forRoutes(TableController);
    }
}