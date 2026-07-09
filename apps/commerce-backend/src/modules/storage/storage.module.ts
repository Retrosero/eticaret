/**
 * Storage modülü.
 *
 * File upload/download için presigned URL'ler üretir.
 * Tenant-bazlı izolasyon zorunludur.
 */
import { Module } from '@nestjs/common';
import { StorageController } from './storage.controller.js';

@Module({
  controllers: [StorageController],
})
export class StorageModule {}