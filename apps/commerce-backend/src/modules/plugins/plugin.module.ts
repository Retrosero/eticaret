/**
 * Plugin Marketplace Module.
 */
import { Module } from '@nestjs/common';
import { PluginController } from './plugin.controller.js';
import { PluginService } from './plugin.service.js';
import { PluginRateLimiter, PluginVersionRegistry } from '@eticart/plugin-sdk';

@Module({
  controllers: [PluginController],
  providers: [
    PluginService,
    PluginVersionRegistry,
    { provide: PluginRateLimiter, useFactory: () => new PluginRateLimiter(60) },
  ],
  exports: [PluginService],
})
export class PluginModule {}
