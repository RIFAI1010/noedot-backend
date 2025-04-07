import { Controller, Get, Post, Body, UseGuards, Query } from '@nestjs/common';
import { UserService } from './user.service';
import { AuthMiddleware } from 'src/common/middlewares/auth.middleware';
import { UserAccessType } from 'src/common/utils/jwt.util';
import { Auth } from 'src/common/decorators/user.decorator';

@Controller('user')
export class UserController {
    constructor(private readonly userService: UserService) { }

    @Get('')
    @UseGuards(AuthMiddleware)
    async findAll() {
        return 'find all users';
    }

    @Get('search')
    @UseGuards(AuthMiddleware)
    async search(
        @Auth() user: UserAccessType,
        @Query() query: { q: string }) {
        return this.userService.search(user.id, query.q);
    }
}
