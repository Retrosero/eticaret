import { Module } from '@nestjs/common';
import { PluginUpdatesController } from './plugin-updates.controller.js';
import { PluginUpdatesService } from './plugin-updates.service.js';

@Module({
  controllers: [PluginUpdatesController],
  providers: [PluginUpdatesService],
  exports: [PluginUpdatesService],
})
export class PluginUpdatesModule {}