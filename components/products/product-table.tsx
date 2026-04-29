import { Package } from "lucide-react";

import { ProductRowActions } from "@/components/products/product-row-actions";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatRupiah } from "@/lib/finance/format";
import { cn } from "@/lib/utils";
import {
  STOCK_STATUS_LABEL,
  type Product,
  type ProductStockStatus,
} from "@/types/sorea";

interface ProductTableProps {
  products: Product[];
  knownCategories?: string[];
}

const stockBadgeVariant: Record<
  ProductStockStatus,
  "success" | "secondary" | "destructive" | "outline"
> = {
  ready: "success",
  terbatas: "secondary",
  habis: "destructive",
  preorder: "outline",
};

export function ProductTable({ products, knownCategories }: ProductTableProps) {
  if (products.length === 0) {
    return (
      <EmptyState
        icon={Package}
        title="Belum ada produk"
        description="Coba ubah filter, atau tambah produk baru lewat tombol di pojok kanan atas."
      />
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-24">SKU</TableHead>
            <TableHead>Nama produk</TableHead>
            <TableHead className="hidden md:table-cell w-40">Kategori</TableHead>
            <TableHead className="text-right w-32">Harga</TableHead>
            <TableHead className="w-32">Stok</TableHead>
            <TableHead className="w-24">Status</TableHead>
            <TableHead className="w-12" aria-label="Aksi" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {products.map((p) => (
            <TableRow
              key={p.id}
              className={cn(!p.is_active && "opacity-60")}
            >
              <TableCell className="font-mono text-xs tabular-nums">
                {p.sku}
              </TableCell>
              <TableCell>
                <div className="space-y-0.5">
                  <p className="text-sm font-medium leading-tight">{p.name}</p>
                  <p className="text-xs text-muted-foreground md:hidden">
                    {p.category}
                  </p>
                </div>
              </TableCell>
              <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                {p.category}
              </TableCell>
              <TableCell className="text-right tabular-nums text-sm font-medium">
                {formatRupiah(p.price)}
              </TableCell>
              <TableCell>
                <Badge variant={stockBadgeVariant[p.stock_status]}>
                  {STOCK_STATUS_LABEL[p.stock_status]}
                </Badge>
              </TableCell>
              <TableCell>
                {p.is_active ? (
                  <span className="text-xs text-success">Aktif</span>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    Sembunyi
                  </span>
                )}
              </TableCell>
              <TableCell className="text-right">
                <ProductRowActions
                  product={p}
                  knownCategories={knownCategories}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
