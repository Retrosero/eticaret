-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('draft', 'active', 'inactive', 'archived', 'out_of_stock', 'discontinued');

-- CreateEnum
CREATE TYPE "CurrencyCode" AS ENUM ('TRY', 'USD', 'EUR', 'GBP');

-- CreateEnum
CREATE TYPE "ProductAttributeType" AS ENUM ('text', 'number', 'boolean', 'select', 'multiselect', 'color', 'date');

-- CreateEnum
CREATE TYPE "ProductDocumentKind" AS ENUM ('manual', 'certificate', 'warranty', 'safety_sheet', 'other');

-- CreateEnum
CREATE TYPE "InventoryMovementKind" AS ENUM ('inbound', 'outbound', 'transfer', 'reservation', 'release', 'adjustment', 'return_in', 'return_out');

-- CreateEnum
CREATE TYPE "PriceListKind" AS ENUM ('b2c_default', 'b2b_dealer', 'customer_group', 'campaign', 'channel');

-- CreateEnum
CREATE TYPE "ProductAuditKind" AS ENUM ('created', 'updated', 'status_changed', 'price_changed', 'stock_changed', 'media_changed', 'deleted');

-- CreateEnum
CREATE TYPE "DealerCompanyStatus" AS ENUM ('active', 'passive', 'suspended', 'pending');

-- CreateEnum
CREATE TYPE "DealerApplicationStatus" AS ENUM ('pending', 'approved', 'rejected', 'withdrawn');

-- CreateEnum
CREATE TYPE "DealerRole" AS ENUM ('dealer_admin', 'dealer_buyer', 'dealer_accountant', 'dealer_approver');

-- CreateEnum
CREATE TYPE "DealerInvitationStatus" AS ENUM ('active', 'invited', 'expired', 'revoked');

-- CreateEnum
CREATE TYPE "CustomerGroupKind" AS ENUM ('b2c', 'b2b_standard', 'b2b_gold', 'b2b_silver', 'b2b_platinum');

-- CreateEnum
CREATE TYPE "PaymentTermKind" AS ENUM ('cash', 'net_15', 'net_30', 'net_45', 'net_60', 'net_90', 'custom');

-- CreateEnum
CREATE TYPE "CreditLimitPolicy" AS ENUM ('block', 'require_approval');

-- CreateEnum
CREATE TYPE "DealerTransactionKind" AS ENUM ('order', 'payment', 'refund', 'adjustment', 'credit_note');

-- CreateEnum
CREATE TYPE "OrderApprovalStatus" AS ENUM ('pending', 'approved', 'rejected', 'skipped');

-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('draft', 'sent', 'accepted', 'rejected', 'expired', 'converted');

-- CreateEnum
CREATE TYPE "CustomerGender" AS ENUM ('male', 'female', 'other', 'prefer_not_to_say');

-- CreateEnum
CREATE TYPE "CustomerStatus" AS ENUM ('active', 'inactive', 'blocked', 'deleted');

-- CreateEnum
CREATE TYPE "AddressKind" AS ENUM ('shipping', 'billing', 'both');

-- CreateEnum
CREATE TYPE "NotificationCategory" AS ENUM ('order_updates', 'shipment', 'return_updates', 'marketing', 'newsletter', 'price_alerts', 'stock_alerts', 'product_review', 'security');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('email', 'sms', 'push');

-- CreateEnum
CREATE TYPE "DataRequestStatus" AS ENUM ('pending', 'processing', 'ready', 'completed', 'rejected', 'failed');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('pending', 'awaiting_payment', 'paid', 'confirmed', 'preparing', 'partially_shipped', 'shipped', 'delivered', 'cancellation_requested', 'cancelled', 'return_requested', 'returned', 'partially_refunded', 'refunded');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('pending', 'authorized', 'captured', 'failed', 'expired', 'refunded', 'partially_refunded');

-- CreateEnum
CREATE TYPE "ShipmentStatus" AS ENUM ('preparing', 'handed_over', 'in_transit', 'out_for_delivery', 'delivered', 'delivery_failed', 'returned_to_sender', 'cancelled');

-- CreateEnum
CREATE TYPE "CancellationStatus" AS ENUM ('pending', 'approved', 'rejected', 'withdrawn', 'expired');

-- CreateEnum
CREATE TYPE "ReturnReasonCategory" AS ENUM ('product_defective', 'wrong_product', 'damaged_in_transit', 'not_as_described', 'size_fit_issue', 'change_of_mind', 'late_delivery', 'other');

-- CreateEnum
CREATE TYPE "ReturnStatus" AS ENUM ('requested', 'approved', 'rejected', 'in_transit', 'received', 'refunded', 'closed');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('pending', 'processing', 'completed', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "InvoiceType" AS ENUM ('pdf', 'e_fatura', 'e_arsiv', 'e_irsaliye');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('draft', 'issued', 'cancelled', 'paid', 'overdue');

-- CreateEnum
CREATE TYPE "EInvoiceStatus" AS ENUM ('not_required', 'pending', 'sent', 'accepted', 'rejected', 'error');

-- CreateEnum
CREATE TYPE "NotificationEventStatus" AS ENUM ('queued', 'processing', 'completed', 'failed', 'dead_lettered');

-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('queued', 'sent', 'delivered', 'bounced', 'failed', 'dead_lettered');

-- CreateEnum
CREATE TYPE "CartStatus" AS ENUM ('ACTIVE', 'ABANDONED', 'CONVERTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "CartItemKind" AS ENUM ('PRODUCT', 'GIFT_CARD', 'CUSTOM');

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "shortDescription" TEXT,
    "description" TEXT,
    "brandId" UUID,
    "status" "ProductStatus" NOT NULL DEFAULT 'draft',
    "weightGrams" INTEGER,
    "taxCategoryId" UUID,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_options" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "product_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_option_values" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "optionId" UUID NOT NULL,
    "value" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "product_option_values_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_variants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "sku" TEXT NOT NULL,
    "barcode" TEXT,
    "gtin" TEXT,
    "mpn" TEXT,
    "name" TEXT,
    "weightGrams" INTEGER,
    "priceAmount" DECIMAL(15,4) NOT NULL DEFAULT 0,
    "currency" "CurrencyCode" NOT NULL DEFAULT 'TRY',
    "stockQty" INTEGER NOT NULL DEFAULT 0,
    "reservedQty" INTEGER NOT NULL DEFAULT 0,
    "position" INTEGER NOT NULL DEFAULT 0,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_variant_option_values" (
    "variantId" UUID NOT NULL,
    "optionId" UUID NOT NULL,
    "valueId" UUID NOT NULL,
    "tenantId" UUID NOT NULL,

    CONSTRAINT "product_variant_option_values_pkey" PRIMARY KEY ("variantId","valueId")
);

-- CreateTable
CREATE TABLE "brands" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "logoKey" TEXT,
    "websiteUrl" TEXT,
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "brands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "parentId" UUID,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "imageKey" TEXT,
    "bannerKey" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "pageTemplate" TEXT,
    "seoTitle" TEXT,
    "seoDescription" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_category_links" (
    "productId" UUID NOT NULL,
    "categoryId" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "product_category_links_pkey" PRIMARY KEY ("productId","categoryId")
);

-- CreateTable
CREATE TABLE "collections" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "imageKey" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "collections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_collection_links" (
    "productId" UUID NOT NULL,
    "collectionId" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "product_collection_links_pkey" PRIMARY KEY ("productId","collectionId")
);

-- CreateTable
CREATE TABLE "product_tags" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_tag_links" (
    "productId" UUID NOT NULL,
    "tagId" UUID NOT NULL,
    "tenantId" UUID NOT NULL,

    CONSTRAINT "product_tag_links_pkey" PRIMARY KEY ("productId","tagId")
);

-- CreateTable
CREATE TABLE "product_attributes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ProductAttributeType" NOT NULL,
    "options" JSONB NOT NULL DEFAULT '[]',
    "isFilterable" BOOLEAN NOT NULL DEFAULT false,
    "isVisible" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_attributes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_attribute_links" (
    "productId" UUID NOT NULL,
    "attributeId" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "value" JSONB NOT NULL,

    CONSTRAINT "product_attribute_links_pkey" PRIMARY KEY ("productId","attributeId")
);

-- CreateTable
CREATE TABLE "product_media" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "altText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_documents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "kind" "ProductDocumentKind" NOT NULL,
    "title" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warehouses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "city" TEXT,
    "country" TEXT DEFAULT 'TR',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_locations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "warehouseId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "stock_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "variantId" UUID,
    "warehouseId" UUID NOT NULL,
    "onHand" INTEGER NOT NULL DEFAULT 0,
    "reserved" INTEGER NOT NULL DEFAULT 0,
    "lowStockThreshold" INTEGER NOT NULL DEFAULT 5,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_movements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "inventoryItemId" UUID NOT NULL,
    "kind" "InventoryMovementKind" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "reference" TEXT,
    "reason" TEXT,
    "actorId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_lists" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "kind" "PriceListKind" NOT NULL,
    "currency" "CurrencyCode" NOT NULL DEFAULT 'TRY',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "customerGroupId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "price_lists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_list_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "priceListId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "variantId" TEXT,
    "unitPrice" DECIMAL(15,4) NOT NULL,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "minQty" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "price_list_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_rules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "priceListId" UUID NOT NULL,
    "minQty" INTEGER NOT NULL,
    "discountPercent" DECIMAL(5,2),
    "discountFixed" DECIMAL(15,4),
    "caseQuantity" INTEGER,

    CONSTRAINT "price_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_categories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rate" DECIMAL(5,2) NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tax_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_channels" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_channels" (
    "productId" UUID NOT NULL,
    "channelId" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "isVisible" BOOLEAN NOT NULL DEFAULT true,
    "externalId" TEXT,

    CONSTRAINT "product_channels_pkey" PRIMARY KEY ("productId","channelId")
);

-- CreateTable
CREATE TABLE "product_visibility" (
    "productId" UUID NOT NULL,
    "customerGroupId" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "isVisible" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "product_visibility_pkey" PRIMARY KEY ("productId","customerGroupId")
);

-- CreateTable
CREATE TABLE "product_seo" (
    "productId" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "metaTitle" TEXT,
    "metaDescription" TEXT,
    "canonicalUrl" TEXT,
    "ogTitle" TEXT,
    "ogDescription" TEXT,
    "ogImageKey" TEXT,
    "twitterCard" TEXT,
    "schemaJson" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_seo_pkey" PRIMARY KEY ("productId")
);

-- CreateTable
CREATE TABLE "product_audits" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "kind" "ProductAuditKind" NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "actorId" UUID,
    "correlationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_audits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_accounts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "taxId" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "tradeName" TEXT,
    "mersisNo" TEXT,
    "kepAddress" TEXT,
    "customerGroupId" UUID,
    "paymentTermId" UUID,
    "salesRepId" UUID,
    "status" "DealerCompanyStatus" NOT NULL DEFAULT 'active',
    "approvedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "currentBalance" DECIMAL(15,4) NOT NULL DEFAULT 0,
    "creditLimit" DECIMAL(15,4) NOT NULL DEFAULT 0,
    "creditLimitPolicy" "CreditLimitPolicy" NOT NULL DEFAULT 'require_approval',
    "isB2B" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dealer_applications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "taxId" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "tradeName" TEXT,
    "contactName" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "contactPhone" TEXT NOT NULL,
    "addressLine1" TEXT NOT NULL,
    "addressLine2" TEXT,
    "city" TEXT NOT NULL,
    "district" TEXT,
    "postalCode" TEXT,
    "country" TEXT NOT NULL DEFAULT 'TR',
    "tradeRegistryDocKey" TEXT,
    "taxPlateDocKey" TEXT,
    "signatureCircularKey" TEXT,
    "status" "DealerApplicationStatus" NOT NULL DEFAULT 'pending',
    "reviewerId" UUID,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "companyAccountId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dealer_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dealer_users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "authUserId" UUID NOT NULL,
    "companyAccountId" UUID NOT NULL,
    "role" "DealerRole" NOT NULL DEFAULT 'dealer_buyer',
    "invitationStatus" "DealerInvitationStatus" NOT NULL DEFAULT 'active',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deactivatedAt" TIMESTAMP(3),
    "customScopes" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dealer_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dealer_invites" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "companyAccountId" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "role" "DealerRole" NOT NULL DEFAULT 'dealer_buyer',
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "inviterId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dealerUserId" UUID,

    CONSTRAINT "dealer_invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dealer_branches" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "companyAccountId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "contactName" TEXT,
    "contactPhone" TEXT,
    "addressLine1" TEXT NOT NULL,
    "addressLine2" TEXT,
    "city" TEXT NOT NULL,
    "district" TEXT,
    "postalCode" TEXT,
    "country" TEXT NOT NULL DEFAULT 'TR',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dealer_branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_groups" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "CustomerGroupKind" NOT NULL DEFAULT 'b2c',
    "forDealers" BOOLEAN NOT NULL DEFAULT false,
    "defaultPriceListId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_terms" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "PaymentTermKind" NOT NULL,
    "dueDays" INTEGER NOT NULL DEFAULT 0,
    "latePaymentPercent" DECIMAL(5,2),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_terms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_limit_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "companyAccountId" UUID NOT NULL,
    "previousLimit" DECIMAL(15,4) NOT NULL,
    "newLimit" DECIMAL(15,4) NOT NULL,
    "previousPolicy" "CreditLimitPolicy",
    "newPolicy" "CreditLimitPolicy",
    "reason" TEXT,
    "actorId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_limit_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dealer_transactions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "companyAccountId" UUID NOT NULL,
    "kind" "DealerTransactionKind" NOT NULL,
    "amount" DECIMAL(15,4) NOT NULL,
    "currency" "CurrencyCode" NOT NULL DEFAULT 'TRY',
    "reference" TEXT,
    "description" TEXT,
    "dueDate" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "actorId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dealer_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dealer_orders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "companyAccountId" UUID NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "paymentTermId" UUID,
    "totalAmount" DECIMAL(15,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dealer_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_representatives" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "authUserId" UUID NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "region" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_representatives_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_workflows" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "rule" JSONB NOT NULL DEFAULT '{}',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "approval_workflows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_steps" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "workflowId" UUID NOT NULL,
    "stepNumber" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "approverRole" TEXT NOT NULL,
    "approverUserId" UUID,
    "minAmount" DECIMAL(15,4),
    "maxAmount" DECIMAL(15,4),

    CONSTRAINT "approval_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_approvals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "dealerOrderId" UUID,
    "workflowId" UUID NOT NULL,
    "companyAccountId" UUID NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "stepNumber" INTEGER NOT NULL,
    "status" "OrderApprovalStatus" NOT NULL DEFAULT 'pending',
    "actorId" UUID,
    "decidedAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "companyAccountId" UUID NOT NULL,
    "quoteNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdById" UUID NOT NULL,
    "salesRepId" UUID,
    "status" "QuoteStatus" NOT NULL DEFAULT 'draft',
    "currency" "CurrencyCode" NOT NULL DEFAULT 'TRY',
    "totalAmount" DECIMAL(15,4) NOT NULL,
    "priceSnapshotKey" TEXT,
    "validUntil" TIMESTAMP(3),
    "convertedOrderNumber" TEXT,
    "customerNote" TEXT,
    "internalNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),

    CONSTRAINT "quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "quoteId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "variantId" UUID,
    "quantity" INTEGER NOT NULL,
    "unitPriceSnapshot" DECIMAL(15,4) NOT NULL,
    "discountPercent" DECIMAL(5,2),
    "discountFixed" DECIMAL(15,4),
    "lineTotal" DECIMAL(15,4) NOT NULL,
    "variantLabel" TEXT,
    "productTitle" TEXT NOT NULL,
    "skuSnapshot" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quote_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_status_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "quoteId" UUID NOT NULL,
    "fromStatus" "QuoteStatus",
    "toStatus" "QuoteStatus" NOT NULL,
    "actorId" UUID,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quote_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_snapshots" (
    "key" TEXT NOT NULL,
    "tenantId" UUID NOT NULL,
    "data" JSONB NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "price_snapshots_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "quick_order_templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "companyAccountId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "items" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quick_order_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dealer_product_visibility" (
    "productId" UUID NOT NULL,
    "companyAccountId" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "isVisible" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "dealer_product_visibility_pkey" PRIMARY KEY ("productId","companyAccountId")
);

-- CreateTable
CREATE TABLE "dealer_category_visibility" (
    "categoryId" UUID NOT NULL,
    "companyAccountId" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "isVisible" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "dealer_category_visibility_pkey" PRIMARY KEY ("categoryId","companyAccountId")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "authUserId" UUID NOT NULL,
    "customerCode" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "identityNumber" TEXT,
    "birthDate" TIMESTAMP(3),
    "gender" "CustomerGender",
    "customerGroupId" UUID,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "phoneVerified" BOOLEAN NOT NULL DEFAULT false,
    "acceptsMarketingEmail" BOOLEAN NOT NULL DEFAULT false,
    "acceptsMarketingSms" BOOLEAN NOT NULL DEFAULT false,
    "kvkkConsentGiven" BOOLEAN NOT NULL DEFAULT false,
    "kvkkConsentDate" TIMESTAMP(3),
    "status" "CustomerStatus" NOT NULL DEFAULT 'active',
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_addresses" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "kind" "AddressKind" NOT NULL DEFAULT 'shipping',
    "label" TEXT,
    "fullName" TEXT NOT NULL,
    "identityNumber" TEXT,
    "phone" TEXT NOT NULL,
    "addressLine1" TEXT NOT NULL,
    "addressLine2" TEXT,
    "city" TEXT NOT NULL,
    "district" TEXT,
    "postalCode" TEXT,
    "country" TEXT NOT NULL DEFAULT 'TR',
    "companyName" TEXT,
    "taxId" TEXT,
    "taxOffice" TEXT,
    "isDefaultShipping" BOOLEAN NOT NULL DEFAULT false,
    "isDefaultBilling" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_notes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "authorId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_payment_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "cardMask" TEXT NOT NULL,
    "cardType" TEXT,
    "expMonth" INTEGER,
    "expYear" INTEGER,
    "cardHolder" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_payment_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "location" TEXT,
    "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "category" "NotificationCategory" NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_data_export_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "status" "DataRequestStatus" NOT NULL DEFAULT 'pending',
    "storageKey" TEXT,
    "readyAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_data_export_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_deletion_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "customerId" UUID NOT NULL,
    "status" "DataRequestStatus" NOT NULL DEFAULT 'pending',
    "confirmationToken" TEXT,
    "scheduledFor" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customer_deletion_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "customerId" UUID,
    "channel" TEXT NOT NULL DEFAULT 'web',
    "currency" "CurrencyCode" NOT NULL DEFAULT 'TRY',
    "status" "OrderStatus" NOT NULL DEFAULT 'pending',
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'pending',
    "subtotalAmount" DECIMAL(15,4) NOT NULL,
    "taxTotal" DECIMAL(15,4) NOT NULL DEFAULT 0,
    "shippingTotal" DECIMAL(15,4) NOT NULL DEFAULT 0,
    "discountTotal" DECIMAL(15,4) NOT NULL DEFAULT 0,
    "grandTotal" DECIMAL(15,4) NOT NULL,
    "refundedAmount" DECIMAL(15,4) NOT NULL DEFAULT 0,
    "couponCode" TEXT,
    "couponDiscount" DECIMAL(15,4) NOT NULL DEFAULT 0,
    "customerNote" TEXT,
    "productSnapshot" JSONB DEFAULT '{}',
    "shippingAddressId" UUID,
    "billingAddressId" UUID,
    "paymentProvider" TEXT,
    "paymentReference" TEXT,
    "paidAt" TIMESTAMP(3),
    "placedAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "preparingAt" TIMESTAMP(3),
    "shippedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "productId" UUID NOT NULL,
    "variantId" UUID,
    "productTitle" TEXT NOT NULL,
    "variantTitle" TEXT,
    "skuSnapshot" TEXT NOT NULL,
    "variantOptionsJson" JSONB NOT NULL DEFAULT '{}',
    "imageKey" TEXT,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(15,4) NOT NULL,
    "discountPercent" DECIMAL(5,2),
    "discountFixed" DECIMAL(15,4),
    "taxRate" DECIMAL(5,2),
    "taxAmount" DECIMAL(15,4),
    "lineTotal" DECIMAL(15,4) NOT NULL,
    "isReturnable" BOOLEAN NOT NULL DEFAULT true,
    "returnedQty" INTEGER NOT NULL DEFAULT 0,
    "isGift" BOOLEAN NOT NULL DEFAULT false,
    "giftMessage" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_status_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "fromStatus" "OrderStatus",
    "toStatus" "OrderStatus" NOT NULL,
    "actorId" UUID,
    "source" TEXT NOT NULL DEFAULT 'system',
    "note" TEXT,
    "correlationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_notes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "isInternal" BOOLEAN NOT NULL DEFAULT true,
    "authorId" UUID,
    "authorName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_shipments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "carrier" TEXT NOT NULL,
    "trackingNumber" TEXT,
    "trackingUrl" TEXT,
    "status" "ShipmentStatus" NOT NULL DEFAULT 'preparing',
    "itemCount" INTEGER NOT NULL DEFAULT 0,
    "shippedAt" TIMESTAMP(3),
    "estimatedDeliveryAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "weightGrams" INTEGER,
    "shippingCost" DECIMAL(15,4),
    "webhookPayload" JSONB DEFAULT '{}',
    "externalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_shipments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipment_tracking_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "shipmentId" UUID NOT NULL,
    "status" "ShipmentStatus" NOT NULL,
    "location" TEXT,
    "description" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "rawPayload" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shipment_tracking_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_shipment_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "shipmentId" UUID NOT NULL,
    "orderItemId" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "order_shipment_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cancellation_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "customerId" UUID,
    "requestedByUserId" UUID,
    "reason" TEXT NOT NULL,
    "description" TEXT,
    "status" "CancellationStatus" NOT NULL DEFAULT 'pending',
    "decidedById" UUID,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "refundAmount" DECIMAL(15,4),
    "stockRestored" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cancellation_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "return_reasons" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" "ReturnReasonCategory" NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "return_reasons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "return_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "rmaNumber" TEXT NOT NULL,
    "customerId" UUID,
    "requestedByUserId" UUID,
    "reasonId" UUID,
    "description" TEXT,
    "status" "ReturnStatus" NOT NULL DEFAULT 'requested',
    "isPartial" BOOLEAN NOT NULL DEFAULT false,
    "refundAmount" DECIMAL(15,4) NOT NULL,
    "currency" "CurrencyCode" NOT NULL DEFAULT 'TRY',
    "photoKeys" JSONB NOT NULL DEFAULT '[]',
    "customerCarrier" TEXT,
    "customerTrackingNumber" TEXT,
    "returnCarrier" TEXT,
    "returnTrackingNumber" TEXT,
    "returnLabelUrl" TEXT,
    "decidedById" UUID,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "receivedAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),
    "stockRestored" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "return_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "return_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "returnRequestId" UUID NOT NULL,
    "orderItemId" UUID NOT NULL,
    "quantity" INTEGER NOT NULL,
    "reasonId" UUID,
    "lineRefund" DECIMAL(15,4) NOT NULL,
    "note" TEXT,
    "photoKeys" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "return_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refund_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "returnRequestId" UUID,
    "cancellationRequestId" UUID,
    "amount" DECIMAL(15,4) NOT NULL,
    "currency" "CurrencyCode" NOT NULL DEFAULT 'TRY',
    "status" "RefundStatus" NOT NULL DEFAULT 'pending',
    "provider" TEXT NOT NULL,
    "providerRef" TEXT,
    "completedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "initiatedById" UUID,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "refund_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_invoices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "invoiceType" "InvoiceType" NOT NULL DEFAULT 'pdf',
    "currency" "CurrencyCode" NOT NULL DEFAULT 'TRY',
    "totalAmount" DECIMAL(15,4) NOT NULL,
    "taxTotal" DECIMAL(15,4) NOT NULL,
    "pdfStorageKey" TEXT,
    "externalUuid" TEXT,
    "eFaturaProvider" TEXT,
    "eInvoiceStatus" "EInvoiceStatus" NOT NULL DEFAULT 'not_required',
    "customerSnapshot" JSONB NOT NULL DEFAULT '{}',
    "companySnapshot" JSONB NOT NULL DEFAULT '{}',
    "itemsSnapshot" JSONB NOT NULL DEFAULT '[]',
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3),
    "createdById" UUID,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_sequences" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "day" TEXT NOT NULL,
    "lastValue" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_sequences" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "lastValue" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoice_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "eventType" TEXT NOT NULL,
    "aggregateType" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "status" "NotificationEventStatus" NOT NULL DEFAULT 'queued',
    "queueName" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "processedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "notificationEventId" UUID,
    "toEmail" TEXT NOT NULL,
    "ccEmails" JSONB NOT NULL DEFAULT '[]',
    "bccEmails" JSONB NOT NULL DEFAULT '[]',
    "subject" TEXT NOT NULL,
    "templateCode" TEXT,
    "htmlSnapshot" TEXT,
    "provider" TEXT NOT NULL,
    "providerMessageId" TEXT,
    "providerType" TEXT NOT NULL,
    "status" "EmailStatus" NOT NULL DEFAULT 'queued',
    "errorMessage" TEXT,
    "openedAt" TIMESTAMP(3),
    "clickedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_status_machine_rules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "fromStatus" "OrderStatus" NOT NULL,
    "toStatus" "OrderStatus" NOT NULL,
    "allowed" BOOLEAN NOT NULL DEFAULT true,
    "requiredRole" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_status_machine_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "carts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenantId" UUID NOT NULL,
    "customerId" UUID,
    "sessionKey" TEXT,
    "currency" VARCHAR(8) NOT NULL DEFAULT 'TRY',
    "status" "CartStatus" NOT NULL DEFAULT 'ACTIVE',
    "subtotal" DECIMAL(15,4) NOT NULL DEFAULT 0,
    "discountTotal" DECIMAL(15,4) NOT NULL DEFAULT 0,
    "shippingTotal" DECIMAL(15,4) NOT NULL DEFAULT 0,
    "taxTotal" DECIMAL(15,4) NOT NULL DEFAULT 0,
    "grandTotal" DECIMAL(15,4) NOT NULL DEFAULT 0,
    "couponCode" TEXT,
    "expiresAt" TIMESTAMP(3),
    "orderId" UUID,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "abandonedAt" TIMESTAMP(3),
    "convertedAt" TIMESTAMP(3),

    CONSTRAINT "carts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cart_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "cartId" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "productId" UUID,
    "variantId" UUID,
    "kind" "CartItemKind" NOT NULL DEFAULT 'PRODUCT',
    "name" TEXT NOT NULL,
    "sku" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(15,4) NOT NULL,
    "finalUnitPrice" DECIMAL(15,4) NOT NULL,
    "lineTotal" DECIMAL(15,4) NOT NULL,
    "variantSnapshot" JSONB,
    "notes" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cart_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_CompanyOverrides" (
    "A" UUID NOT NULL,
    "B" UUID NOT NULL
);

-- CreateIndex
CREATE INDEX "products_tenantId_status_idx" ON "products"("tenantId", "status");

-- CreateIndex
CREATE INDEX "products_tenantId_brandId_idx" ON "products"("tenantId", "brandId");

-- CreateIndex
CREATE UNIQUE INDEX "products_tenantId_slug_key" ON "products"("tenantId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "products_tenantId_id_key" ON "products"("tenantId", "id");

-- CreateIndex
CREATE INDEX "product_options_tenantId_idx" ON "product_options"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "product_options_productId_name_key" ON "product_options"("productId", "name");

-- CreateIndex
CREATE INDEX "product_option_values_tenantId_idx" ON "product_option_values"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "product_option_values_optionId_value_key" ON "product_option_values"("optionId", "value");

-- CreateIndex
CREATE INDEX "product_variants_productId_idx" ON "product_variants"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_tenantId_sku_key" ON "product_variants"("tenantId", "sku");

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_tenantId_barcode_key" ON "product_variants"("tenantId", "barcode");

-- CreateIndex
CREATE INDEX "product_variant_option_values_tenantId_idx" ON "product_variant_option_values"("tenantId");

-- CreateIndex
CREATE INDEX "brands_tenantId_idx" ON "brands"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "brands_tenantId_slug_key" ON "brands"("tenantId", "slug");

-- CreateIndex
CREATE INDEX "categories_tenantId_parentId_idx" ON "categories"("tenantId", "parentId");

-- CreateIndex
CREATE UNIQUE INDEX "categories_tenantId_slug_key" ON "categories"("tenantId", "slug");

-- CreateIndex
CREATE INDEX "product_category_links_tenantId_categoryId_idx" ON "product_category_links"("tenantId", "categoryId");

-- CreateIndex
CREATE INDEX "collections_tenantId_idx" ON "collections"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "collections_tenantId_slug_key" ON "collections"("tenantId", "slug");

-- CreateIndex
CREATE INDEX "product_collection_links_tenantId_idx" ON "product_collection_links"("tenantId");

-- CreateIndex
CREATE INDEX "product_tags_tenantId_idx" ON "product_tags"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "product_tags_tenantId_slug_key" ON "product_tags"("tenantId", "slug");

-- CreateIndex
CREATE INDEX "product_tag_links_tenantId_idx" ON "product_tag_links"("tenantId");

-- CreateIndex
CREATE INDEX "product_attributes_tenantId_idx" ON "product_attributes"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "product_attributes_tenantId_slug_key" ON "product_attributes"("tenantId", "slug");

-- CreateIndex
CREATE INDEX "product_attribute_links_tenantId_idx" ON "product_attribute_links"("tenantId");

-- CreateIndex
CREATE INDEX "product_media_tenantId_productId_idx" ON "product_media"("tenantId", "productId");

-- CreateIndex
CREATE INDEX "product_documents_tenantId_productId_idx" ON "product_documents"("tenantId", "productId");

-- CreateIndex
CREATE INDEX "warehouses_tenantId_idx" ON "warehouses"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "warehouses_tenantId_code_key" ON "warehouses"("tenantId", "code");

-- CreateIndex
CREATE INDEX "stock_locations_tenantId_idx" ON "stock_locations"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "stock_locations_warehouseId_code_key" ON "stock_locations"("warehouseId", "code");

-- CreateIndex
CREATE INDEX "inventory_items_tenantId_productId_idx" ON "inventory_items"("tenantId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_items_tenantId_variantId_warehouseId_key" ON "inventory_items"("tenantId", "variantId", "warehouseId");

-- CreateIndex
CREATE INDEX "inventory_movements_tenantId_inventoryItemId_idx" ON "inventory_movements"("tenantId", "inventoryItemId");

-- CreateIndex
CREATE INDEX "inventory_movements_tenantId_reference_idx" ON "inventory_movements"("tenantId", "reference");

-- CreateIndex
CREATE INDEX "price_lists_tenantId_idx" ON "price_lists"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "price_lists_tenantId_slug_key" ON "price_lists"("tenantId", "slug");

-- CreateIndex
CREATE INDEX "price_list_entries_tenantId_productId_idx" ON "price_list_entries"("tenantId", "productId");

-- CreateIndex
CREATE INDEX "price_rules_tenantId_priceListId_idx" ON "price_rules"("tenantId", "priceListId");

-- CreateIndex
CREATE INDEX "tax_categories_tenantId_idx" ON "tax_categories"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "tax_categories_tenantId_slug_key" ON "tax_categories"("tenantId", "slug");

-- CreateIndex
CREATE INDEX "sales_channels_tenantId_idx" ON "sales_channels"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "sales_channels_tenantId_slug_key" ON "sales_channels"("tenantId", "slug");

-- CreateIndex
CREATE INDEX "product_channels_tenantId_idx" ON "product_channels"("tenantId");

-- CreateIndex
CREATE INDEX "product_visibility_tenantId_idx" ON "product_visibility"("tenantId");

-- CreateIndex
CREATE INDEX "product_seo_tenantId_idx" ON "product_seo"("tenantId");

-- CreateIndex
CREATE INDEX "product_audits_tenantId_productId_idx" ON "product_audits"("tenantId", "productId");

-- CreateIndex
CREATE INDEX "product_audits_tenantId_createdAt_idx" ON "product_audits"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "company_accounts_tenantId_status_idx" ON "company_accounts"("tenantId", "status");

-- CreateIndex
CREATE INDEX "company_accounts_tenantId_customerGroupId_idx" ON "company_accounts"("tenantId", "customerGroupId");

-- CreateIndex
CREATE UNIQUE INDEX "company_accounts_tenantId_taxId_key" ON "company_accounts"("tenantId", "taxId");

-- CreateIndex
CREATE INDEX "dealer_applications_tenantId_status_idx" ON "dealer_applications"("tenantId", "status");

-- CreateIndex
CREATE INDEX "dealer_applications_tenantId_taxId_idx" ON "dealer_applications"("tenantId", "taxId");

-- CreateIndex
CREATE INDEX "dealer_users_tenantId_companyAccountId_idx" ON "dealer_users"("tenantId", "companyAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "dealer_users_tenantId_authUserId_key" ON "dealer_users"("tenantId", "authUserId");

-- CreateIndex
CREATE INDEX "dealer_invites_tenantId_email_idx" ON "dealer_invites"("tenantId", "email");

-- CreateIndex
CREATE INDEX "dealer_invites_tenantId_companyAccountId_idx" ON "dealer_invites"("tenantId", "companyAccountId");

-- CreateIndex
CREATE INDEX "dealer_branches_tenantId_companyAccountId_idx" ON "dealer_branches"("tenantId", "companyAccountId");

-- CreateIndex
CREATE INDEX "customer_groups_tenantId_idx" ON "customer_groups"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "customer_groups_tenantId_slug_key" ON "customer_groups"("tenantId", "slug");

-- CreateIndex
CREATE INDEX "payment_terms_tenantId_idx" ON "payment_terms"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "payment_terms_tenantId_slug_key" ON "payment_terms"("tenantId", "slug");

-- CreateIndex
CREATE INDEX "credit_limit_history_tenantId_companyAccountId_idx" ON "credit_limit_history"("tenantId", "companyAccountId");

-- CreateIndex
CREATE INDEX "dealer_transactions_tenantId_companyAccountId_idx" ON "dealer_transactions"("tenantId", "companyAccountId");

-- CreateIndex
CREATE INDEX "dealer_transactions_tenantId_reference_idx" ON "dealer_transactions"("tenantId", "reference");

-- CreateIndex
CREATE INDEX "dealer_transactions_tenantId_kind_idx" ON "dealer_transactions"("tenantId", "kind");

-- CreateIndex
CREATE INDEX "dealer_orders_tenantId_companyAccountId_idx" ON "dealer_orders"("tenantId", "companyAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "dealer_orders_tenantId_orderNumber_key" ON "dealer_orders"("tenantId", "orderNumber");

-- CreateIndex
CREATE INDEX "sales_representatives_tenantId_idx" ON "sales_representatives"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "sales_representatives_tenantId_authUserId_key" ON "sales_representatives"("tenantId", "authUserId");

-- CreateIndex
CREATE INDEX "approval_workflows_tenantId_idx" ON "approval_workflows"("tenantId");

-- CreateIndex
CREATE INDEX "approval_steps_tenantId_workflowId_idx" ON "approval_steps"("tenantId", "workflowId");

-- CreateIndex
CREATE INDEX "order_approvals_tenantId_status_idx" ON "order_approvals"("tenantId", "status");

-- CreateIndex
CREATE INDEX "order_approvals_tenantId_companyAccountId_idx" ON "order_approvals"("tenantId", "companyAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "order_approvals_tenantId_orderNumber_stepNumber_key" ON "order_approvals"("tenantId", "orderNumber", "stepNumber");

-- CreateIndex
CREATE INDEX "quotes_tenantId_companyAccountId_idx" ON "quotes"("tenantId", "companyAccountId");

-- CreateIndex
CREATE INDEX "quotes_tenantId_status_idx" ON "quotes"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "quotes_tenantId_quoteNumber_key" ON "quotes"("tenantId", "quoteNumber");

-- CreateIndex
CREATE INDEX "quote_items_tenantId_quoteId_idx" ON "quote_items"("tenantId", "quoteId");

-- CreateIndex
CREATE INDEX "quote_status_history_tenantId_quoteId_idx" ON "quote_status_history"("tenantId", "quoteId");

-- CreateIndex
CREATE INDEX "price_snapshots_tenantId_idx" ON "price_snapshots"("tenantId");

-- CreateIndex
CREATE INDEX "quick_order_templates_tenantId_companyAccountId_idx" ON "quick_order_templates"("tenantId", "companyAccountId");

-- CreateIndex
CREATE INDEX "dealer_product_visibility_tenantId_idx" ON "dealer_product_visibility"("tenantId");

-- CreateIndex
CREATE INDEX "dealer_category_visibility_tenantId_idx" ON "dealer_category_visibility"("tenantId");

-- CreateIndex
CREATE INDEX "customers_tenantId_email_idx" ON "customers"("tenantId", "email");

-- CreateIndex
CREATE INDEX "customers_tenantId_status_idx" ON "customers"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "customers_tenantId_customerCode_key" ON "customers"("tenantId", "customerCode");

-- CreateIndex
CREATE UNIQUE INDEX "customers_tenantId_authUserId_key" ON "customers"("tenantId", "authUserId");

-- CreateIndex
CREATE INDEX "customer_addresses_tenantId_customerId_idx" ON "customer_addresses"("tenantId", "customerId");

-- CreateIndex
CREATE INDEX "customer_notes_tenantId_customerId_idx" ON "customer_notes"("tenantId", "customerId");

-- CreateIndex
CREATE INDEX "customer_payment_tokens_tenantId_customerId_idx" ON "customer_payment_tokens"("tenantId", "customerId");

-- CreateIndex
CREATE INDEX "customer_sessions_tenantId_customerId_idx" ON "customer_sessions"("tenantId", "customerId");

-- CreateIndex
CREATE INDEX "customer_sessions_tenantId_lastActiveAt_idx" ON "customer_sessions"("tenantId", "lastActiveAt");

-- CreateIndex
CREATE INDEX "notification_preferences_tenantId_customerId_idx" ON "notification_preferences"("tenantId", "customerId");

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_tenantId_customerId_category_chann_key" ON "notification_preferences"("tenantId", "customerId", "category", "channel");

-- CreateIndex
CREATE INDEX "customer_data_export_requests_tenantId_customerId_idx" ON "customer_data_export_requests"("tenantId", "customerId");

-- CreateIndex
CREATE INDEX "customer_data_export_requests_tenantId_status_idx" ON "customer_data_export_requests"("tenantId", "status");

-- CreateIndex
CREATE INDEX "customer_deletion_requests_tenantId_customerId_idx" ON "customer_deletion_requests"("tenantId", "customerId");

-- CreateIndex
CREATE INDEX "customer_deletion_requests_tenantId_status_idx" ON "customer_deletion_requests"("tenantId", "status");

-- CreateIndex
CREATE INDEX "orders_tenantId_customerId_idx" ON "orders"("tenantId", "customerId");

-- CreateIndex
CREATE INDEX "orders_tenantId_status_idx" ON "orders"("tenantId", "status");

-- CreateIndex
CREATE INDEX "orders_tenantId_paymentStatus_idx" ON "orders"("tenantId", "paymentStatus");

-- CreateIndex
CREATE INDEX "orders_tenantId_createdAt_idx" ON "orders"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "orders_tenantId_orderNumber_key" ON "orders"("tenantId", "orderNumber");

-- CreateIndex
CREATE INDEX "order_items_tenantId_orderId_idx" ON "order_items"("tenantId", "orderId");

-- CreateIndex
CREATE INDEX "order_items_tenantId_productId_idx" ON "order_items"("tenantId", "productId");

-- CreateIndex
CREATE INDEX "order_status_history_tenantId_orderId_idx" ON "order_status_history"("tenantId", "orderId");

-- CreateIndex
CREATE INDEX "order_status_history_tenantId_createdAt_idx" ON "order_status_history"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "order_notes_tenantId_orderId_idx" ON "order_notes"("tenantId", "orderId");

-- CreateIndex
CREATE INDEX "order_shipments_tenantId_orderId_idx" ON "order_shipments"("tenantId", "orderId");

-- CreateIndex
CREATE INDEX "order_shipments_tenantId_trackingNumber_idx" ON "order_shipments"("tenantId", "trackingNumber");

-- CreateIndex
CREATE INDEX "shipment_tracking_events_tenantId_shipmentId_idx" ON "shipment_tracking_events"("tenantId", "shipmentId");

-- CreateIndex
CREATE INDEX "shipment_tracking_events_tenantId_occurredAt_idx" ON "shipment_tracking_events"("tenantId", "occurredAt");

-- CreateIndex
CREATE INDEX "order_shipment_items_tenantId_idx" ON "order_shipment_items"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "order_shipment_items_shipmentId_orderItemId_key" ON "order_shipment_items"("shipmentId", "orderItemId");

-- CreateIndex
CREATE UNIQUE INDEX "cancellation_requests_orderId_key" ON "cancellation_requests"("orderId");

-- CreateIndex
CREATE INDEX "cancellation_requests_tenantId_status_idx" ON "cancellation_requests"("tenantId", "status");

-- CreateIndex
CREATE INDEX "cancellation_requests_tenantId_orderId_idx" ON "cancellation_requests"("tenantId", "orderId");

-- CreateIndex
CREATE INDEX "cancellation_requests_tenantId_customerId_idx" ON "cancellation_requests"("tenantId", "customerId");

-- CreateIndex
CREATE INDEX "return_reasons_tenantId_idx" ON "return_reasons"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "return_reasons_tenantId_slug_key" ON "return_reasons"("tenantId", "slug");

-- CreateIndex
CREATE INDEX "return_requests_tenantId_orderId_idx" ON "return_requests"("tenantId", "orderId");

-- CreateIndex
CREATE INDEX "return_requests_tenantId_customerId_idx" ON "return_requests"("tenantId", "customerId");

-- CreateIndex
CREATE INDEX "return_requests_tenantId_status_idx" ON "return_requests"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "return_requests_tenantId_rmaNumber_key" ON "return_requests"("tenantId", "rmaNumber");

-- CreateIndex
CREATE INDEX "return_items_tenantId_returnRequestId_idx" ON "return_items"("tenantId", "returnRequestId");

-- CreateIndex
CREATE INDEX "refund_records_tenantId_orderId_idx" ON "refund_records"("tenantId", "orderId");

-- CreateIndex
CREATE INDEX "refund_records_tenantId_status_idx" ON "refund_records"("tenantId", "status");

-- CreateIndex
CREATE INDEX "refund_records_tenantId_provider_idx" ON "refund_records"("tenantId", "provider");

-- CreateIndex
CREATE INDEX "order_invoices_tenantId_orderId_idx" ON "order_invoices"("tenantId", "orderId");

-- CreateIndex
CREATE INDEX "order_invoices_tenantId_status_idx" ON "order_invoices"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "order_invoices_tenantId_invoiceNumber_key" ON "order_invoices"("tenantId", "invoiceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "order_sequences_tenantId_day_key" ON "order_sequences"("tenantId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_sequences_tenantId_year_key" ON "invoice_sequences"("tenantId", "year");

-- CreateIndex
CREATE INDEX "notification_events_tenantId_eventType_idx" ON "notification_events"("tenantId", "eventType");

-- CreateIndex
CREATE INDEX "notification_events_tenantId_status_idx" ON "notification_events"("tenantId", "status");

-- CreateIndex
CREATE INDEX "notification_events_tenantId_createdAt_idx" ON "notification_events"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "notification_events_tenantId_idempotencyKey_key" ON "notification_events"("tenantId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "email_logs_tenantId_status_idx" ON "email_logs"("tenantId", "status");

-- CreateIndex
CREATE INDEX "email_logs_tenantId_toEmail_idx" ON "email_logs"("tenantId", "toEmail");

-- CreateIndex
CREATE INDEX "email_logs_tenantId_createdAt_idx" ON "email_logs"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "order_status_machine_rules_tenantId_idx" ON "order_status_machine_rules"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "order_status_machine_rules_tenantId_fromStatus_toStatus_key" ON "order_status_machine_rules"("tenantId", "fromStatus", "toStatus");

-- CreateIndex
CREATE INDEX "carts_tenantId_customerId_idx" ON "carts"("tenantId", "customerId");

-- CreateIndex
CREATE INDEX "carts_tenantId_status_idx" ON "carts"("tenantId", "status");

-- CreateIndex
CREATE INDEX "carts_expiresAt_idx" ON "carts"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "carts_tenantId_sessionKey_key" ON "carts"("tenantId", "sessionKey");

-- CreateIndex
CREATE INDEX "cart_items_cartId_idx" ON "cart_items"("cartId");

-- CreateIndex
CREATE INDEX "cart_items_tenantId_productId_idx" ON "cart_items"("tenantId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "cart_items_cartId_variantId_key" ON "cart_items"("cartId", "variantId");

-- CreateIndex
CREATE UNIQUE INDEX "_CompanyOverrides_AB_unique" ON "_CompanyOverrides"("A", "B");

-- CreateIndex
CREATE INDEX "_CompanyOverrides_B_index" ON "_CompanyOverrides"("B");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_taxCategoryId_fkey" FOREIGN KEY ("taxCategoryId") REFERENCES "tax_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_options" ADD CONSTRAINT "product_options_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_option_values" ADD CONSTRAINT "product_option_values_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "product_options"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_variant_option_values" ADD CONSTRAINT "product_variant_option_values_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_variant_option_values" ADD CONSTRAINT "product_variant_option_values_valueId_fkey" FOREIGN KEY ("valueId") REFERENCES "product_option_values"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_category_links" ADD CONSTRAINT "product_category_links_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_category_links" ADD CONSTRAINT "product_category_links_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_collection_links" ADD CONSTRAINT "product_collection_links_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_collection_links" ADD CONSTRAINT "product_collection_links_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "collections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_tag_links" ADD CONSTRAINT "product_tag_links_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_tag_links" ADD CONSTRAINT "product_tag_links_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "product_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_attribute_links" ADD CONSTRAINT "product_attribute_links_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_attribute_links" ADD CONSTRAINT "product_attribute_links_attributeId_fkey" FOREIGN KEY ("attributeId") REFERENCES "product_attributes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_media" ADD CONSTRAINT "product_media_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_documents" ADD CONSTRAINT "product_documents_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_locations" ADD CONSTRAINT "stock_locations_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_lists" ADD CONSTRAINT "price_lists_customerGroupId_fkey" FOREIGN KEY ("customerGroupId") REFERENCES "customer_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_list_entries" ADD CONSTRAINT "price_list_entries_priceListId_fkey" FOREIGN KEY ("priceListId") REFERENCES "price_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_list_entries" ADD CONSTRAINT "price_list_entries_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_rules" ADD CONSTRAINT "price_rules_priceListId_fkey" FOREIGN KEY ("priceListId") REFERENCES "price_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_channels" ADD CONSTRAINT "product_channels_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_channels" ADD CONSTRAINT "product_channels_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "sales_channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_visibility" ADD CONSTRAINT "product_visibility_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_visibility" ADD CONSTRAINT "product_visibility_customerGroupId_fkey" FOREIGN KEY ("customerGroupId") REFERENCES "customer_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_seo" ADD CONSTRAINT "product_seo_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_audits" ADD CONSTRAINT "product_audits_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_accounts" ADD CONSTRAINT "company_accounts_customerGroupId_fkey" FOREIGN KEY ("customerGroupId") REFERENCES "customer_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_accounts" ADD CONSTRAINT "company_accounts_paymentTermId_fkey" FOREIGN KEY ("paymentTermId") REFERENCES "payment_terms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_accounts" ADD CONSTRAINT "company_accounts_salesRepId_fkey" FOREIGN KEY ("salesRepId") REFERENCES "sales_representatives"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dealer_applications" ADD CONSTRAINT "dealer_applications_companyAccountId_fkey" FOREIGN KEY ("companyAccountId") REFERENCES "company_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dealer_users" ADD CONSTRAINT "dealer_users_companyAccountId_fkey" FOREIGN KEY ("companyAccountId") REFERENCES "company_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dealer_invites" ADD CONSTRAINT "dealer_invites_dealerUserId_fkey" FOREIGN KEY ("dealerUserId") REFERENCES "dealer_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dealer_branches" ADD CONSTRAINT "dealer_branches_companyAccountId_fkey" FOREIGN KEY ("companyAccountId") REFERENCES "company_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_groups" ADD CONSTRAINT "customer_groups_defaultPriceListId_fkey" FOREIGN KEY ("defaultPriceListId") REFERENCES "price_lists"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_limit_history" ADD CONSTRAINT "credit_limit_history_companyAccountId_fkey" FOREIGN KEY ("companyAccountId") REFERENCES "company_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dealer_transactions" ADD CONSTRAINT "dealer_transactions_companyAccountId_fkey" FOREIGN KEY ("companyAccountId") REFERENCES "company_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dealer_orders" ADD CONSTRAINT "dealer_orders_companyAccountId_fkey" FOREIGN KEY ("companyAccountId") REFERENCES "company_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approval_steps" ADD CONSTRAINT "approval_steps_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "approval_workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_approvals" ADD CONSTRAINT "order_approvals_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "approval_workflows"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_approvals" ADD CONSTRAINT "order_approvals_dealerOrderId_fkey" FOREIGN KEY ("dealerOrderId") REFERENCES "dealer_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_approvals" ADD CONSTRAINT "order_approvals_companyAccountId_fkey" FOREIGN KEY ("companyAccountId") REFERENCES "company_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_companyAccountId_fkey" FOREIGN KEY ("companyAccountId") REFERENCES "company_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_priceSnapshotKey_fkey" FOREIGN KEY ("priceSnapshotKey") REFERENCES "price_snapshots"("key") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_status_history" ADD CONSTRAINT "quote_status_history_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quick_order_templates" ADD CONSTRAINT "quick_order_templates_companyAccountId_fkey" FOREIGN KEY ("companyAccountId") REFERENCES "company_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_customerGroupId_fkey" FOREIGN KEY ("customerGroupId") REFERENCES "customer_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_notes" ADD CONSTRAINT "customer_notes_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_payment_tokens" ADD CONSTRAINT "customer_payment_tokens_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_sessions" ADD CONSTRAINT "customer_sessions_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_data_export_requests" ADD CONSTRAINT "customer_data_export_requests_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_deletion_requests" ADD CONSTRAINT "customer_deletion_requests_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_shippingAddressId_fkey" FOREIGN KEY ("shippingAddressId") REFERENCES "customer_addresses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_billingAddressId_fkey" FOREIGN KEY ("billingAddressId") REFERENCES "customer_addresses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_status_history" ADD CONSTRAINT "order_status_history_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_notes" ADD CONSTRAINT "order_notes_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_shipments" ADD CONSTRAINT "order_shipments_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipment_tracking_events" ADD CONSTRAINT "shipment_tracking_events_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "order_shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_shipment_items" ADD CONSTRAINT "order_shipment_items_shipmentId_fkey" FOREIGN KEY ("shipmentId") REFERENCES "order_shipments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cancellation_requests" ADD CONSTRAINT "cancellation_requests_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cancellation_requests" ADD CONSTRAINT "cancellation_requests_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_requests" ADD CONSTRAINT "return_requests_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_requests" ADD CONSTRAINT "return_requests_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_requests" ADD CONSTRAINT "return_requests_reasonId_fkey" FOREIGN KEY ("reasonId") REFERENCES "return_reasons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_items" ADD CONSTRAINT "return_items_returnRequestId_fkey" FOREIGN KEY ("returnRequestId") REFERENCES "return_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_items" ADD CONSTRAINT "return_items_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_items" ADD CONSTRAINT "return_items_reasonId_fkey" FOREIGN KEY ("reasonId") REFERENCES "return_reasons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund_records" ADD CONSTRAINT "refund_records_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_invoices" ADD CONSTRAINT "order_invoices_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_logs" ADD CONSTRAINT "email_logs_notificationEventId_fkey" FOREIGN KEY ("notificationEventId") REFERENCES "notification_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_cartId_fkey" FOREIGN KEY ("cartId") REFERENCES "carts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CompanyOverrides" ADD CONSTRAINT "_CompanyOverrides_A_fkey" FOREIGN KEY ("A") REFERENCES "company_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_CompanyOverrides" ADD CONSTRAINT "_CompanyOverrides_B_fkey" FOREIGN KEY ("B") REFERENCES "price_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

