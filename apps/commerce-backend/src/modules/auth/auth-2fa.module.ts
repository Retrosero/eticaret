import { Module } from '@nestjs/common';
import { Auth2FAController } from './auth-2fa.controller.js';

@Module({
  controllers: [Auth2FAController],
})
export class Auth2FAModule {}