import { Controller, Get } from "@nestjs/common";
import { DebugService } from "./debug.service";


@Controller('debug')
export class DebugController {
    constructor(private readonly debugService: DebugService) { }

    @Get()
    getDebug() {
        return this.debugService.getDebug();
    }
}

