/**
 * Checkout modülü — controller + provider registry'leri.
 */

import { Module } from '@nestjs/common';

import { CheckoutController } from './checkout.controller.js';
import {
  paymentRegistryProvider,
  shippingRegistryProvider,
} from './checkout.providers.js';

@Module({
  controllers: [CheckoutController],
  providers: [paymentRegistryProvider, shippingRegistryProvider],
})
export class CheckoutModule {}