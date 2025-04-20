import { MiddlewareConsumer, Module } from "@nestjs/common";
import { DocumentController } from "./document.controller";
import { DocumentService } from "./document.service";
import { AuthMiddleware } from "src/common/middlewares/auth.middleware";
import { ConfigModule } from "@nestjs/config";
import { PrismaService } from "src/prisma/prisma.service";
import { WebsocketModule } from "src/websocket/websocket.module";
import { NoteModule } from "src/note/note.module";

@Module({
    imports: [ConfigModule, WebsocketModule, NoteModule],
    controllers: [DocumentController],
    providers: [DocumentService, PrismaService],
    exports: [DocumentService]
})
export class DocumentModule {
    configure(consumer: MiddlewareConsumer) {
        consumer.apply(AuthMiddleware).forRoutes(DocumentController);
    }
}