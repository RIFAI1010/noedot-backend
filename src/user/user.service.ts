import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UserService {
    constructor(private prisma: PrismaService) { }    

    async search(userId: string, query: string) {
        const users = await this.prisma.user.findMany({
            where: {
                OR: [{ name: { contains: query } }, { email: { contains: query } }],
            },
            take: 5,
            select: {
                id: true,
                name: true,
                email: true,                
            }
        });
        return users;
    }
}
