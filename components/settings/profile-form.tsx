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
  updateProfileAction,
  type ProfileFormState,
} from "@/lib/finance/settings/actions";
import type { Profile } from "@/types/finance";

const initialState: ProfileFormState = { ok: false };

interface ProfileFormProps {
  profile: Profile;
  email: string | null;
}

export function ProfileForm({ profile, email }: ProfileFormProps) {
  const [state, formAction, pending] = useActionState(
    updateProfileAction,
    initialState,
  );

  React.useEffect(() => {
    if (state.ok && state.message) toast.success(state.message);
    else if (!state.ok && state.message) toast.error(state.message);
  }, [state]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profil saya</CardTitle>
        <CardDescription>
          Nama yang ditampilkan di sidebar dan dipakai sebagai pencatat
          transaksi.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} noValidate className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="full_name">Nama lengkap</Label>
            <Input
              id="full_name"
              name="full_name"
              type="text"
              defaultValue={profile.full_name ?? ""}
              required
              aria-invalid={Boolean(state.fieldErrors?.full_name)}
            />
            {state.fieldErrors?.full_name && (
              <p className="text-xs text-destructive">
                {state.fieldErrors.full_name}
              </p>
            )}
          </div>

          {email && (
            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={email} readOnly disabled />
              <p className="text-xs text-muted-foreground">
                Untuk ganti email hubungi admin / reset via Supabase Auth.
              </p>
            </div>
          )}

          <div className="flex justify-end">
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              Simpan profil
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
