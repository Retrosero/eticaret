/**
 * Plugin Marketplace Module.
 */
import { Module } from '@nestjs/common';
import { PluginController } from './plugin.controller.js';
import { PluginService } from './plugin.service.js';

@Module({
  controllers: [PluginController],
  providers: [PluginService],
  exports: [PluginService],
})
export class PluginModule {}
