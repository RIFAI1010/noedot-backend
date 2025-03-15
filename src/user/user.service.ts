import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UserService {
    constructor(private prisma: PrismaService) { }

    async getAllUsers() {
        return this.prisma.user.findMany();
    }

    async createUser(name: string, email: string) {
        return this.prisma.user.create({
            data: { email, password: 'defaultPassword' },
        });
    }
}
