import { DebugService } from "./debug.service";
import { DebugController } from "./debug.controller";
import { Module } from "@nestjs/common";
import { PrismaService } from "src/prisma/prisma.service";
import { ConfigModule } from "@nestjs/config";
import { PrismaModule } from "src/prisma/prisma.module";

@Module({
    imports: [ConfigModule, PrismaModule],
    controllers: [DebugController],
    providers: [DebugService],
    exports: [DebugService]
})
export class DebugModule { }

