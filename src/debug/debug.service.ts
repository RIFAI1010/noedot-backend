import { Injectable, BadRequestException } from "@nestjs/common";
import { PrismaService } from "src/prisma/prisma.service";


@Injectable()
export class DebugService {
    constructor(private readonly prisma: PrismaService) { }


    async getDebug() {
        throw new BadRequestException('your action is not allowed');
    }
}

