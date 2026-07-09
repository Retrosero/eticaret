import { Module } from '@nestjs/common';
import { AuthRefreshController } from './auth-refresh.controller.js';

@Module({
  controllers: [AuthRefreshController],
})
export class AuthRefreshModule {}