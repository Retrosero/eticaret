import { Module } from '@nestjs/common';
import { ThemeController } from './theme.controller.js';
import { ThemeService } from './theme.service.js';
import { StorefrontPagesController } from './storefront-pages.controller.js';
import { StorefrontPagesService } from './storefront-pages.service.js';
import { StorefrontProductsController } from './storefront-products.controller.js';
import { StorefrontProductsService } from './storefront-products.service.js';
import { StorefrontTaxonomyController } from './storefront-taxonomy.controller.js';
import { StorefrontTaxonomyService } from './storefront-taxonomy.service.js';
import { StorefrontContentController } from './storefront-content.controller.js';
import { StorefrontContentService } from './storefront-content.service.js';

@Module({
  controllers: [ThemeController, StorefrontPagesController, StorefrontProductsController, StorefrontTaxonomyController, StorefrontContentController],
  providers: [ThemeService, StorefrontPagesService, StorefrontProductsService, StorefrontTaxonomyService, StorefrontContentService],
})
export class ThemeModule {}
