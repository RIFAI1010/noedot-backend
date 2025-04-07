import { Module } from '@nestjs/common';
import { VerificationGateway } from './verification.gateway';

@Module({
    providers: [VerificationGateway],
    exports: [VerificationGateway],
})
export class WebsocketModule { }
