"use client";

import * as React from "react";

import { useLianaRuns, type LianaRun } from "@/hooks/use-liana-runs";

const MAX_VISIBLE_PILLS = 3;
const DONE_AUTO_DISMISS_MS = 30_000;
const ERROR_AUTO_DISMISS_MS = 30_000;
const TICK_INTERVAL_MS = 1_000;
const PROMPT_PREVIEW_MAX = 80;

export type PillStatus = "sending" | "thinking" | "done" | "error";

export interface PillView {
  /** Stable client-side ID (UUID) — survives even sebelum runId diketahui. */
  clientId: string;
  /** Truncated prompt untuk display (max ~80 char). */
  promptPreview: string;
  /** Server-side run ID, set setelah `/api/liana/ask` sukses. */
  runId: string | null;
  status: PillStatus;
  errorMessage: string | null;
  hovered: boolean;
}

interface PillInternal {
  clientId: string;
  prompt: string;
  runId: string | null;
  /** Saat pill pertama kali masuk state terminal (done/error) — buat
   *  hitung auto-dismiss timeout. Hover akan PAUSE timer (lihat tick effect).
   *  Di-set lazily oleh tick interval saat run pill transition ke done/error. */
  resolvedAt: number | null;
  /** Override error dari API (sebelum runId diketahui, atau network error).
   *  Mengandung message + timestamp transisi (= resolvedAt utk error path). */
  errorOverride: { message: string; at: number } | null;
  hovered: boolean;
}

interface LianaUIContextValue {
  /** Semua run user (dari Realtime). Dipakai chat panel + derive pill state. */
  runs: LianaRun[];
  pendingCount: number;
  loading: boolean;

  /** Pill list yang lagi visible (max 3, FIFO). */
  pills: PillView[];
  /** Push pill baru — dipanggil AskLianaButton saat klik. Returns clientId. */
  addPill: (prompt: string) => string;
  /** Set runId setelah API success. Pill akan transition ke "thinking". */
  setPillRunId: (clientId: string, runId: string) => void;
  /** Set error override — dipanggil saat API error sebelum runId. */
  setPillError: (clientId: string, message: string) => void;
  /** Manual dismiss (X button). */
  dismissPill: (clientId: string) => void;
  /** Hover state — pause auto-dismiss timer saat hovered. */
  setPillHover: (clientId: string, hovered: boolean) => void;

  /** Chat panel drawer state. Lifted dari LianaChatPanel internal. */
  chatPanelOpen: boolean;
  setChatPanelOpen: (open: boolean) => void;
  /** Run yang harus di-scroll-to + highlight saat panel buka. Null = tidak. */
  selectedRunId: string | null;
  setSelectedRunId: (id: string | null) => void;
  /** Convenience: buka panel + select run + highlight (dipakai pill "Lihat"). */
  openRunInPanel: (runId: string) => void;
}

const LianaUIContext = React.createContext<LianaUIContextValue | null>(null);

interface LianaUIProviderProps {
  userId: string;
  children: React.ReactNode;
}

/**
 * Provider yang mempersatukan semua UI state Liana di satu tree:
 *
 * - `useLianaRuns` subscription (1x untuk seluruh app)
 * - Pill stack (toast progressive feedback)
 * - Chat panel drawer state (open + selectedRunId)
 *
 * Diletakkan di root authenticated layout supaya AskLianaButton (yang
 * di-render banyak tempat) bisa push pill, dan pill stack + chat panel
 * (yang di-render sekali di layout) bisa baca state.
 */
export function LianaUIProvider({ userId, children }: LianaUIProviderProps) {
  const { runs, pendingCount, loading } = useLianaRuns({ userId });

  const [pills, setPills] = React.useState<PillInternal[]>([]);
  const [chatPanelOpen, setChatPanelOpen] = React.useState(false);
  const [selectedRunId, setSelectedRunId] = React.useState<string | null>(null);

  // Ref ke runs terbaru — di-baca dari dalam tick interval. Di-update
  // setiap kali runs berubah, tapi tidak men-trigger re-render interval.
  const runsRef = React.useRef(runs);
  React.useEffect(() => {
    runsRef.current = runs;
  }, [runs]);

  // Single tick interval (1 detik). Tugas:
  //  1. Detect transisi run ke status terminal (done/error) → set resolvedAt.
  //  2. Auto-dismiss pill yang resolved > N detik dan gak hovered.
  //
  // Dilakukan di dalam setInterval callback (bukan effect body langsung)
  // untuk hindari pattern setState-in-effect yang trigger cascading
  // renders. setState di dalam async callback adalah pattern yang oke
  // (lihat React docs: "Subscribe for updates from some external system,
  // calling setState in a callback function when external state changes").
  React.useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const currentRuns = runsRef.current;

      setPills((prev) => {
        // Tahap 1: Tandai resolvedAt utk pill yang baru transition.
        const stamped = prev.map((p) => {
          if (p.resolvedAt !== null) return p;
          if (p.errorOverride) {
            return { ...p, resolvedAt: p.errorOverride.at };
          }
          if (!p.runId) return p;
          const run = resolveRunForPill(p.runId, currentRuns);
          if (!run) return p;
          if (run.status === "done") {
            const at = run.delivered_at
              ? new Date(run.delivered_at).getTime()
              : now;
            return { ...p, resolvedAt: at };
          }
          if (run.status === "error") {
            return { ...p, resolvedAt: now };
          }
          return p;
        });

        // Tahap 2: Auto-dismiss yang udah expired & gak di-hover.
        return stamped.filter((p) => {
          if (p.hovered) return true;
          if (p.resolvedAt === null) return true;
          const age = now - p.resolvedAt;
          const limit = p.errorOverride
            ? ERROR_AUTO_DISMISS_MS
            : DONE_AUTO_DISMISS_MS;
          return age < limit;
        });
      });
    }, TICK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  const addPill = React.useCallback((prompt: string): string => {
    const clientId = makeClientId();
    setPills((prev) => {
      const next: PillInternal = {
        clientId,
        prompt,
        runId: null,
        resolvedAt: null,
        errorOverride: null,
        hovered: false,
      };
      // Cap di MAX_VISIBLE_PILLS — kalau penuh, drop yang paling lama (FIFO).
      const merged = [...prev, next];
      return merged.length > MAX_VISIBLE_PILLS
        ? merged.slice(merged.length - MAX_VISIBLE_PILLS)
        : merged;
    });
    return clientId;
  }, []);

  const setPillRunId = React.useCallback((clientId: string, runId: string) => {
    setPills((prev) =>
      prev.map((p) => (p.clientId === clientId ? { ...p, runId } : p)),
    );
  }, []);

  const setPillError = React.useCallback(
    (clientId: string, message: string) => {
      const at = Date.now();
      setPills((prev) =>
        prev.map((p) =>
          p.clientId === clientId
            ? { ...p, errorOverride: { message, at }, resolvedAt: at }
            : p,
        ),
      );
    },
    [],
  );

  const dismissPill = React.useCallback((clientId: string) => {
    setPills((prev) => prev.filter((p) => p.clientId !== clientId));
  }, []);

  const setPillHover = React.useCallback(
    (clientId: string, hovered: boolean) => {
      setPills((prev) =>
        prev.map((p) => (p.clientId === clientId ? { ...p, hovered } : p)),
      );
    },
    [],
  );

  const openRunInPanel = React.useCallback((runId: string) => {
    setChatPanelOpen(true);
    setSelectedRunId(runId);
  }, []);

  // Derive PillView[] dari internal state + runs.
  const pillsView: PillView[] = React.useMemo(
    () =>
      pills.map((p) => {
        const status = derivePillStatus(p, runs);
        const errorMessage = deriveErrorMessage(p, runs);
        return {
          clientId: p.clientId,
          promptPreview: previewPrompt(p.prompt),
          runId: p.runId,
          status,
          errorMessage,
          hovered: p.hovered,
        };
      }),
    [pills, runs],
  );

  const value: LianaUIContextValue = {
    runs,
    pendingCount,
    loading,
    pills: pillsView,
    addPill,
    setPillRunId,
    setPillError,
    dismissPill,
    setPillHover,
    chatPanelOpen,
    setChatPanelOpen,
    selectedRunId,
    setSelectedRunId,
    openRunInPanel,
  };

  return (
    <LianaUIContext.Provider value={value}>{children}</LianaUIContext.Provider>
  );
}

export function useLianaUI(): LianaUIContextValue {
  const ctx = React.useContext(LianaUIContext);
  if (!ctx) {
    throw new Error("useLianaUI harus di-render di dalam <LianaUIProvider>");
  }
  return ctx;
}

/**
 * Hook ringan buat consumer yang OPSIONAL — kalau gak di dalam provider,
 * return null (gak throw). Dipakai AskLianaButton supaya tetap bisa
 * dirender di route tanpa provider (mis. landing page) tanpa crash.
 */
export function useLianaUIOptional(): LianaUIContextValue | null {
  return React.useContext(LianaUIContext);
}

// === Helpers ===

function makeClientId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `pill-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function previewPrompt(prompt: string): string {
  if (prompt.length <= PROMPT_PREVIEW_MAX) return prompt;
  return `${prompt.slice(0, PROMPT_PREVIEW_MAX - 3).trimEnd()}...`;
}

function derivePillStatus(p: PillInternal, runs: LianaRun[]): PillStatus {
  if (p.errorOverride) return "error";
  if (!p.runId) return "sending";
  const run = resolveRunForPill(p.runId, runs);
  if (!run) {
    // Realtime row belum sampai — tapi karena runId udah ada (API sukses),
    // kita anggap state-nya "thinking" (Liana lagi process).
    return "thinking";
  }
  if (run.status === "pending") return "thinking";
  if (run.status === "done") return "done";
  return "error";
}

function deriveErrorMessage(
  p: PillInternal,
  runs: LianaRun[],
): string | null {
  if (p.errorOverride) return p.errorOverride.message;
  if (!p.runId) return null;
  const run = resolveRunForPill(p.runId, runs);
  if (run?.status === "error") return run.error_message;
  return null;
}

/**
 * Defensive lookup: AskLianaButton SEHARUSNYA menyimpan dashboard PK
 * (`liana_runs.id`) ke pill.runId, tapi kalau ada path yang masih kirim
 * OpenClaw runId (cached client lama, race condition, dll), kita fallback
 * cocokkan ke kolom `run_id`. Ini bikin pill resilient terhadap variant
 * mana pun yang masuk — selama salah satu nge-link ke row yang ada.
 */
function resolveRunForPill(
  pillRunId: string,
  runs: LianaRun[],
): LianaRun | undefined {
  return (
    runs.find((r) => r.id === pillRunId) ??
    runs.find((r) => r.run_id === pillRunId)
  );
}
