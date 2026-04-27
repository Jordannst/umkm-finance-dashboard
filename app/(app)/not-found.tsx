import Link from "next/link";
import { Compass } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function AppNotFound() {
  return (
    <div className="grid place-items-center py-10">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-muted text-muted-foreground">
            <Compass className="h-6 w-6" aria-hidden />
          </div>
          <CardTitle className="mt-2">Halaman tidak ditemukan</CardTitle>
          <CardDescription>
            URL yang kamu buka tidak terdaftar di app keuangan ini.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center">
          <Button asChild>
            <Link href="/dashboard">Kembali ke dashboard</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
