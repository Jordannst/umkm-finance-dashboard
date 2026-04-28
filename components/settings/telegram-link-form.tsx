"use client";

import * as React from "react";
import { useActionState } from "react";
import { Bot, ExternalLink, Loader2, Unlink } from "lucide-react";
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
  unlinkTelegramAction,
  updateTelegramLinkAction,
  type TelegramLinkFormState,
} from "@/lib/finance/settings/actions";
import { cn } from "@/lib/utils";
import type { Profile } from "@/types/finance";

const initialState: TelegramLinkFormState = { ok: false };

interface TelegramLinkFormProps {
  profile: Profile;
  /** Username bot tanpa @, contoh: 'OpenClaw_BOT'. */
  botUsername: string | null;
}

export function TelegramLinkForm({
  profile,
  botUsername,
}: TelegramLinkFormProps) {
  const [state, formAction, pending] = useActionState(
    updateTelegramLinkAction,
    initialState,
  );
  const [unlinkPending, startUnlink] = React.useTransition();

  React.useEffect(() => {
    if (state.ok && state.message) toast.success(state.message);
    else if (!state.ok && state.message) toast.error(state.message);
  }, [state]);

  const isLinked = Boolean(profile.telegram_chat_id);

  function handleUnlink() {
    startUnlink(async () => {
      const result = await unlinkTelegramAction();
      if (result.ok) toast.success(result.message ?? "Telegram diputuskan.");
      else toast.error(result.message ?? "Gagal memutuskan Telegram.");
    });
  }

  const botUrl = botUsername ? `https://t.me/${botUsername}` : null;

  return (
    <Card className={cn(isLinked && "border-primary/30 bg-primary/[0.02]")}>
      <CardHeader>
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
            <Bot className="h-5 w-5" aria-hidden />
          </div>
          <div className="flex-1 space-y-1">
            <CardTitle className="text-base">Hubungkan Telegram</CardTitle>
            <CardDescription>
              {isLinked
                ? "Akun Telegram sudah terhubung. Tombol \"Tanya Liana\" akan langsung kirim prompt ke chat-mu."
                : "Hubungkan Telegram supaya tombol \"Tanya Liana\" bisa langsung kirim prompt ke Liana."}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLinked ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2 rounded-md border border-success/30 bg-success/5 px-3 py-2 text-sm">
              <div>
                <p className="font-medium text-success">
                  ✓ Terhubung
                </p>
                <p className="text-xs text-muted-foreground">
                  Chat ID:{" "}
                  <span className="font-mono">{profile.telegram_chat_id}</span>
                </p>
              </div>
              {profile.telegram_linked_at && (
                <p className="hidden text-xs text-muted-foreground sm:block">
                  Sejak{" "}
                  {new Date(profile.telegram_linked_at).toLocaleDateString(
                    "id-ID",
                    { day: "numeric", month: "short", year: "numeric" },
                  )}
                </p>
              )}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleUnlink}
              disabled={unlinkPending}
            >
              {unlinkPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Unlink className="h-3.5 w-3.5" />
              )}
              Putuskan Telegram
            </Button>
          </div>
        ) : (
          <>
            <ol className="space-y-2 rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
              <li>
                <strong className="text-foreground">1.</strong> Buka{" "}
                {botUrl ? (
                  <a
                    href={botUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                  >
                    @{botUsername}
                    <ExternalLink className="h-3 w-3" aria-hidden />
                  </a>
                ) : (
                  <span className="font-medium">bot Liana di Telegram</span>
                )}{" "}
                lalu kirim <code className="rounded bg-background px-1">/start</code>.
              </li>
              <li>
                <strong className="text-foreground">2.</strong> Liana akan balas
                dengan Chat ID kamu (angka panjang).
              </li>
              <li>
                <strong className="text-foreground">3.</strong> Paste Chat ID
                tersebut di bawah, lalu klik <em>Hubungkan</em>.
              </li>
            </ol>

            <form action={formAction} noValidate className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="telegram_chat_id">Chat ID Telegram</Label>
                <Input
                  id="telegram_chat_id"
                  name="telegram_chat_id"
                  type="text"
                  inputMode="numeric"
                  placeholder="contoh: 1304543553"
                  required
                  aria-invalid={Boolean(state.fieldErrors?.telegram_chat_id)}
                />
                {state.fieldErrors?.telegram_chat_id && (
                  <p className="text-xs text-destructive">
                    {state.fieldErrors.telegram_chat_id}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                {botUrl && (
                  <Button asChild type="button" variant="ghost" size="sm">
                    <a href={botUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-3.5 w-3.5" />
                      Buka @{botUsername}
                    </a>
                  </Button>
                )}
                <Button type="submit" disabled={pending}>
                  {pending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Hubungkan
                </Button>
              </div>
            </form>
          </>
        )}
      </CardContent>
    </Card>
  );
}
