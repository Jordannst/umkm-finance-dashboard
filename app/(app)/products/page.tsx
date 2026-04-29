import type { Metadata } from "next";
import { Building2 } from "lucide-react";

import { ProductAddButton } from "@/components/products/product-add-button";
import { ProductFilters } from "@/components/products/product-filters";
import { ProductTable } from "@/components/products/product-table";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { getCurrentBusinessId } from "@/lib/finance/business";
import {
  listProductCategories,
  listProducts,
} from "@/lib/sorea/products/queries";
import type { ProductStockStatus } from "@/types/sorea";

export const metadata: Metadata = {
  title: "Produk",
};

export const dynamic = "force-dynamic";

interface ProductsPageProps {
  searchParams: Promise<{
    search?: string;
    category?: string;
    stock_status?: string;
    /** "all" (default) | "active" | "inactive" */
    active?: string;
  }>;
}

export default async function ProductsPage({ searchParams }: ProductsPageProps) {
  const businessId = await getCurrentBusinessId();

  if (!businessId) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Produk"
          description="Katalog produk SOREA — harga, stok, dan ketersediaan."
        />
        <EmptyState
          icon={Building2}
          title="Belum ada bisnis terhubung"
          description="Pastikan migration dan seed Supabase sudah dijalankan."
        />
      </div>
    );
  }

  const sp = await searchParams;
  const stockStatus = parseStockStatus(sp.stock_status);
  const activeFilter = sp.active === "active" || sp.active === "inactive"
    ? sp.active
    : null;

  // Two parallel fetches: products (filtered) + all categories untuk
  // populate filter dropdown + autocomplete suggest di form.
  const [products, categories] = await Promise.all([
    listProducts(businessId, {
      search: sp.search ?? null,
      category: sp.category ?? null,
      stockStatus,
      activeOnly: activeFilter === "active",
    }),
    listProductCategories(businessId),
  ]);

  // Untuk filter "inactive only" kita tidak punya helper, jadi filter
  // di JS layer (volume produk biasanya kecil < 100 row).
  const finalProducts =
    activeFilter === "inactive"
      ? products.filter((p) => !p.is_active)
      : products;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Produk"
        description="Katalog produk SOREA — harga, stok, dan ketersediaan untuk dashboard, chat order, dan invoice."
        actions={<ProductAddButton knownCategories={categories} />}
      />

      <ProductFilters categories={categories} />

      <ProductTable products={finalProducts} knownCategories={categories} />
    </div>
  );
}

function parseStockStatus(raw: string | undefined): ProductStockStatus | null {
  if (raw === "ready" || raw === "habis" || raw === "terbatas" || raw === "preorder") {
    return raw;
  }
  return null;
}
