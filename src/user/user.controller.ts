import { Controller, Get, Post, Body } from '@nestjs/common';
import { UserService } from './user.service';

@Controller('users')
export class UserController {
    constructor(private readonly userService: UserService) { }

    @Get()
    getUsers() {
        return this.userService.getAllUsers();
    }

    @Post()
    createUser(@Body() body: { name: string; email: string }) {
        return this.userService.createUser(body.name, body.email);
    }
}
