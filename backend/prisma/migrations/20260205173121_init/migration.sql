-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('AVAILABLE', 'LOW_STOCK', 'OUT_OF_STOCK', 'DISCONTINUED');

-- CreateEnum
CREATE TYPE "MaterialRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'FULFILLED');

-- CreateEnum
CREATE TYPE "MaterialUrgency" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "ClientOrderStatus" AS ENUM ('PENDING', 'APPROVED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'VERIFIED', 'PAID', 'FAILED');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'IN_TRANSIT', 'DELIVERED', 'RETURNED', 'DELAYED');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('ACTIVE', 'ON_HOLD', 'COMPLETED');

-- CreateEnum
CREATE TYPE "SupplierOrderStatus" AS ENUM ('DRAFT', 'PENDING', 'APPROVED', 'ORDERED', 'RECEIVED', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'APPROVE', 'REJECT', 'CONFIRM', 'LOGIN');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('LOW_STOCK', 'ORDER_APPROVAL', 'DELIVERY_UPDATE', 'PAYMENT_VERIFIED', 'REQUEST_APPROVAL', 'QUOTE_RESPONSE', 'AI_ALERT');

-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('PENDING', 'RESPONDED', 'ACCEPTED', 'DECLINED');

-- CreateEnum
CREATE TYPE "StockTransactionType" AS ENUM ('PURCHASE', 'ISSUE', 'RETURN', 'ADJUSTMENT');

-- CreateTable
CREATE TABLE "roles" (
    "role_id" SERIAL NOT NULL,
    "role_name" VARCHAR(50) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("role_id")
);

-- CreateTable
CREATE TABLE "users" (
    "user_id" SERIAL NOT NULL,
    "full_name" VARCHAR(150) NOT NULL,
    "email" VARCHAR(150) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role_id" INTEGER,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "product_categories" (
    "category_id" SERIAL NOT NULL,
    "category_name" VARCHAR(100) NOT NULL,

    CONSTRAINT "product_categories_pkey" PRIMARY KEY ("category_id")
);

-- CreateTable
CREATE TABLE "products" (
    "product_id" SERIAL NOT NULL,
    "item_name" VARCHAR(150) NOT NULL,
    "unit" VARCHAR(50),
    "unit_price" DECIMAL(12,2) NOT NULL,
    "category_id" INTEGER,
    "status" "ProductStatus" NOT NULL DEFAULT 'AVAILABLE',
    "qty_on_hand" INTEGER NOT NULL DEFAULT 0,
    "low_stock_threshold" INTEGER NOT NULL DEFAULT 20,

    CONSTRAINT "products_pkey" PRIMARY KEY ("product_id")
);

-- CreateTable
CREATE TABLE "clients" (
    "client_id" SERIAL NOT NULL,
    "client_name" VARCHAR(150) NOT NULL,
    "address" TEXT,
    "email" VARCHAR(150),

    CONSTRAINT "clients_pkey" PRIMARY KEY ("client_id")
);

-- CreateTable
CREATE TABLE "projects" (
    "project_id" SERIAL NOT NULL,
    "project_name" VARCHAR(150) NOT NULL,
    "client_id" INTEGER,
    "status" "ProjectStatus" NOT NULL DEFAULT 'ACTIVE',
    "start_date" DATE,
    "total_value" DECIMAL(12,2) NOT NULL DEFAULT 0,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("project_id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "supplier_id" SERIAL NOT NULL,
    "supplier_name" VARCHAR(150) NOT NULL,
    "country" VARCHAR(100),
    "email" VARCHAR(150),

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("supplier_id")
);

-- CreateTable
CREATE TABLE "orders" (
    "order_id" SERIAL NOT NULL,
    "supplier_id" INTEGER,
    "project_id" INTEGER,
    "order_date" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "SupplierOrderStatus" NOT NULL DEFAULT 'PENDING',
    "terms" VARCHAR(100),
    "remarks" TEXT,
    "subtotal" DECIMAL(12,2),
    "vat" DECIMAL(12,2),
    "total" DECIMAL(12,2),
    "approved_by" TEXT,
    "approved_by_id" INTEGER,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("order_id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "order_item_id" SERIAL NOT NULL,
    "order_id" INTEGER,
    "product_id" INTEGER,
    "quantity" INTEGER NOT NULL,
    "unit_price" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("order_item_id")
);

-- CreateTable
CREATE TABLE "material_requests" (
    "request_id" SERIAL NOT NULL,
    "request_number" VARCHAR(50) NOT NULL,
    "project_id" INTEGER,
    "requested_by" INTEGER,
    "request_date" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "MaterialRequestStatus" NOT NULL DEFAULT 'PENDING',
    "urgency" "MaterialUrgency",
    "est_cost" DECIMAL(12,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "material_requests_pkey" PRIMARY KEY ("request_id")
);

-- CreateTable
CREATE TABLE "material_request_items" (
    "item_id" SERIAL NOT NULL,
    "request_id" INTEGER,
    "product_id" INTEGER,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "material_request_items_pkey" PRIMARY KEY ("item_id")
);

-- CreateTable
CREATE TABLE "client_orders" (
    "client_order_id" SERIAL NOT NULL,
    "order_number" VARCHAR(50) NOT NULL,
    "project_id" INTEGER,
    "client_id" INTEGER,
    "subtotal" DECIMAL(12,2),
    "vat" DECIMAL(12,2),
    "total" DECIMAL(12,2),
    "status" "ClientOrderStatus" NOT NULL DEFAULT 'PENDING',
    "payment_status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "order_date" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" INTEGER,
    "special_instructions" TEXT,

    CONSTRAINT "client_orders_pkey" PRIMARY KEY ("client_order_id")
);

-- CreateTable
CREATE TABLE "client_order_items" (
    "item_id" SERIAL NOT NULL,
    "client_order_id" INTEGER,
    "product_id" INTEGER,
    "quantity" INTEGER NOT NULL,
    "unit_price" DECIMAL(12,2),

    CONSTRAINT "client_order_items_pkey" PRIMARY KEY ("item_id")
);

-- CreateTable
CREATE TABLE "deliveries" (
    "delivery_id" SERIAL NOT NULL,
    "dr_number" VARCHAR(50) NOT NULL,
    "client_order_id" INTEGER,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "eta" DATE,
    "items_count" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "received_at" TIMESTAMP(3),
    "received_by" TEXT,
    "notes" TEXT,

    CONSTRAINT "deliveries_pkey" PRIMARY KEY ("delivery_id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "log_id" SERIAL NOT NULL,
    "user_id" INTEGER,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "action" "AuditAction" NOT NULL,
    "target" VARCHAR(100) NOT NULL,
    "details" TEXT,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("log_id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "notification_id" SERIAL NOT NULL,
    "user_id" INTEGER,
    "type" "NotificationType" NOT NULL,
    "title" VARCHAR(150) NOT NULL,
    "message" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("notification_id")
);

-- CreateTable
CREATE TABLE "quote_requests" (
    "quote_request_id" SERIAL NOT NULL,
    "client_id" INTEGER,
    "project_id" INTEGER,
    "status" "QuoteStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "responded_at" TIMESTAMP(3),
    "quoted_amount" DECIMAL(12,2),
    "custom_requirements" TEXT,

    CONSTRAINT "quote_requests_pkey" PRIMARY KEY ("quote_request_id")
);

-- CreateTable
CREATE TABLE "quote_request_items" (
    "quote_request_item_id" SERIAL NOT NULL,
    "quote_request_id" INTEGER,
    "item_name" VARCHAR(150) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "notes" TEXT,

    CONSTRAINT "quote_request_items_pkey" PRIMARY KEY ("quote_request_item_id")
);

-- CreateTable
CREATE TABLE "stock_transactions" (
    "transaction_id" SERIAL NOT NULL,
    "product_id" INTEGER,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" "StockTransactionType" NOT NULL,
    "qty_change" INTEGER NOT NULL,
    "new_balance" INTEGER NOT NULL,
    "user_id" INTEGER,
    "notes" TEXT,

    CONSTRAINT "stock_transactions_pkey" PRIMARY KEY ("transaction_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "roles_role_name_key" ON "roles"("role_name");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_id_idx" ON "users"("role_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_categories_category_name_key" ON "product_categories"("category_name");

-- CreateIndex
CREATE INDEX "products_category_id_idx" ON "products"("category_id");

-- CreateIndex
CREATE INDEX "projects_client_id_idx" ON "projects"("client_id");

-- CreateIndex
CREATE INDEX "orders_supplier_id_idx" ON "orders"("supplier_id");

-- CreateIndex
CREATE INDEX "orders_project_id_idx" ON "orders"("project_id");

-- CreateIndex
CREATE INDEX "orders_approved_by_id_idx" ON "orders"("approved_by_id");

-- CreateIndex
CREATE INDEX "order_items_order_id_idx" ON "order_items"("order_id");

-- CreateIndex
CREATE INDEX "order_items_product_id_idx" ON "order_items"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "material_requests_request_number_key" ON "material_requests"("request_number");

-- CreateIndex
CREATE INDEX "material_requests_project_id_idx" ON "material_requests"("project_id");

-- CreateIndex
CREATE INDEX "material_requests_requested_by_idx" ON "material_requests"("requested_by");

-- CreateIndex
CREATE INDEX "material_request_items_request_id_idx" ON "material_request_items"("request_id");

-- CreateIndex
CREATE INDEX "material_request_items_product_id_idx" ON "material_request_items"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "client_orders_order_number_key" ON "client_orders"("order_number");

-- CreateIndex
CREATE INDEX "client_orders_project_id_idx" ON "client_orders"("project_id");

-- CreateIndex
CREATE INDEX "client_orders_client_id_idx" ON "client_orders"("client_id");

-- CreateIndex
CREATE INDEX "client_order_items_client_order_id_idx" ON "client_order_items"("client_order_id");

-- CreateIndex
CREATE INDEX "client_order_items_product_id_idx" ON "client_order_items"("product_id");

-- CreateIndex
CREATE UNIQUE INDEX "deliveries_dr_number_key" ON "deliveries"("dr_number");

-- CreateIndex
CREATE INDEX "deliveries_client_order_id_idx" ON "deliveries"("client_order_id");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs"("user_id");

-- CreateIndex
CREATE INDEX "audit_logs_timestamp_idx" ON "audit_logs"("timestamp");

-- CreateIndex
CREATE INDEX "notifications_user_id_idx" ON "notifications"("user_id");

-- CreateIndex
CREATE INDEX "notifications_created_at_idx" ON "notifications"("created_at");

-- CreateIndex
CREATE INDEX "quote_requests_client_id_idx" ON "quote_requests"("client_id");

-- CreateIndex
CREATE INDEX "quote_requests_project_id_idx" ON "quote_requests"("project_id");

-- CreateIndex
CREATE INDEX "quote_request_items_quote_request_id_idx" ON "quote_request_items"("quote_request_id");

-- CreateIndex
CREATE INDEX "stock_transactions_product_id_idx" ON "stock_transactions"("product_id");

-- CreateIndex
CREATE INDEX "stock_transactions_user_id_idx" ON "stock_transactions"("user_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("role_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "product_categories"("category_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("client_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("supplier_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("project_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("order_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("product_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_requests" ADD CONSTRAINT "material_requests_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("project_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_requests" ADD CONSTRAINT "material_requests_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_request_items" ADD CONSTRAINT "material_request_items_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "material_requests"("request_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "material_request_items" ADD CONSTRAINT "material_request_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("product_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_orders" ADD CONSTRAINT "client_orders_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("project_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_orders" ADD CONSTRAINT "client_orders_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("client_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_order_items" ADD CONSTRAINT "client_order_items_client_order_id_fkey" FOREIGN KEY ("client_order_id") REFERENCES "client_orders"("client_order_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_order_items" ADD CONSTRAINT "client_order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("product_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_client_order_id_fkey" FOREIGN KEY ("client_order_id") REFERENCES "client_orders"("client_order_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_requests" ADD CONSTRAINT "quote_requests_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("client_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_requests" ADD CONSTRAINT "quote_requests_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("project_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_request_items" ADD CONSTRAINT "quote_request_items_quote_request_id_fkey" FOREIGN KEY ("quote_request_id") REFERENCES "quote_requests"("quote_request_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transactions" ADD CONSTRAINT "stock_transactions_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("product_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_transactions" ADD CONSTRAINT "stock_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE SET NULL ON UPDATE CASCADE;
