import type { Metadata } from "next";
import { Building2 } from "lucide-react";

import { BusinessForm } from "@/components/settings/business-form";
import { CategoriesSection } from "@/components/settings/categories-section";
import { ProfileForm } from "@/components/settings/profile-form";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import {
  getCurrentBusiness,
  getCurrentProfile,
  getCurrentUserEmail,
} from "@/lib/finance/business";
import { getCategoriesGrouped } from "@/lib/finance/settings/queries";

export const metadata: Metadata = {
  title: "Pengaturan",
};

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [profile, business, email] = await Promise.all([
    getCurrentProfile(),
    getCurrentBusiness(),
    getCurrentUserEmail(),
  ]);

  if (!profile) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Pengaturan"
          description="Kelola profil dan kategori transaksi."
        />
        <EmptyState
          icon={Building2}
          title="Sesi tidak valid"
          description="Login ulang untuk membuka pengaturan."
        />
      </div>
    );
  }

  if (!business || !profile.business_id) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Pengaturan"
          description="Kelola profil dan kategori transaksi."
        />
        <ProfileForm profile={profile} email={email} />
        <EmptyState
          icon={Building2}
          title="Belum ada bisnis terhubung"
          description="Pengaturan bisnis dan kategori muncul setelah akun terhubung ke business."
        />
      </div>
    );
  }

  const categories = await getCategoriesGrouped(profile.business_id);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pengaturan"
        description="Kelola profil pribadi, profil bisnis, dan kategori untuk klasifikasi transaksi."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <ProfileForm profile={profile} email={email} />
        <BusinessForm business={business} />
      </div>

      <CategoriesSection
        income={categories.income}
        expense={categories.expense}
        receivable={categories.receivable}
      />
    </div>
  );
}
