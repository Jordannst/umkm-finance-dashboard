import {
  LayoutDashboard,
  ArrowLeftRight,
  Package,
  Wallet,
  FileBarChart,
  Settings,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
}

export const navItems: NavItem[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    description: "Ringkasan keuangan harian",
    icon: LayoutDashboard,
  },
  {
    href: "/products",
    label: "Produk",
    description: "Katalog menu SOREA",
    icon: Package,
  },
  {
    href: "/transactions",
    label: "Transaksi",
    description: "Pemasukan & pengeluaran",
    icon: ArrowLeftRight,
  },
  {
    href: "/receivables",
    label: "Piutang",
    description: "Pelanggan belum bayar",
    icon: Wallet,
  },
  {
    href: "/reports",
    label: "Rekap",
    description: "Laporan harian & mingguan",
    icon: FileBarChart,
  },
  {
    href: "/settings",
    label: "Pengaturan",
    description: "Profil bisnis & integrasi",
    icon: Settings,
  },
];
