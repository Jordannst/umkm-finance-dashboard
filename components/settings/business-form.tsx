"use client";

import * as React from "react";
import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  updateBusinessAction,
  type BusinessFormState,
} from "@/lib/finance/settings/actions";
import type { Business } from "@/types/finance";

const initialState: BusinessFormState = { ok: false };

interface BusinessFormProps {
  business: Business;
}

export function BusinessForm({ business }: BusinessFormProps) {
  const [state, formAction, pending] = useActionState(
    updateBusinessAction,
    initialState,
  );

  React.useEffect(() => {
    if (state.ok && state.message) toast.success(state.message);
    else if (!state.ok && state.message) toast.error(state.message);
  }, [state]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profil bisnis</CardTitle>
        <CardDescription>
          Nama bisnis muncul di header dashboard dan laporan.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} noValidate className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="business-name">Nama bisnis</Label>
            <Input
              id="business-name"
              name="name"
              type="text"
              defaultValue={business.name}
              required
              aria-invalid={Boolean(state.fieldErrors?.name)}
            />
            {state.fieldErrors?.name && (
              <p className="text-xs text-destructive">
                {state.fieldErrors.name}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="owner_name">Nama owner (opsional)</Label>
            <Input
              id="owner_name"
              name="owner_name"
              type="text"
              defaultValue={business.owner_name ?? ""}
              aria-invalid={Boolean(state.fieldErrors?.owner_name)}
            />
            {state.fieldErrors?.owner_name && (
              <p className="text-xs text-destructive">
                {state.fieldErrors.owner_name}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Business ID</Label>
            <Input value={business.id} readOnly disabled className="font-mono text-xs" />
            <p className="text-xs text-muted-foreground">
              UUID ini dipakai sebagai <code className="rounded bg-muted px-1">business_id</code>{" "}
              saat Liana memanggil API.
            </p>
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              Simpan bisnis
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
