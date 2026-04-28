"use client";

import * as React from "react";

import { LianaStatusPill } from "./liana-status-pill";
import { useLianaUI } from "./liana-ui-context";

/**
 * Stack container untuk Liana status pills.
 *
 * Position: fixed bottom-center, max 3 pills visible (FIFO via context).
 * Layout: column-reverse — pill terbaru di paling bawah (paling visible).
 *
 * Klik tombol "Lihat" pada pill done → buka chat panel + scroll & highlight
 * row yang sesuai. Klik "Detail" pada pill error → sama (user bisa retry
 * dari panel).
 */
export function LianaPillStack() {
  const { pills, dismissPill, setPillHover, openRunInPanel } = useLianaUI();

  if (pills.length === 0) return null;

  return (
    <div
      // pointer-events-none di wrapper supaya pill stack gak block klik di
      // halaman bawahnya. Pill itu sendiri pointer-events-auto.
      className="pointer-events-none fixed inset-x-0 bottom-3 z-40 flex justify-center px-3 sm:bottom-4"
      aria-label="Status Liana"
    >
      <ul className="flex max-w-[min(420px,calc(100vw-1.5rem))] flex-col-reverse gap-2">
        {pills.map((pill) => (
          <li key={pill.clientId} className="flex justify-center">
            <LianaStatusPill
              pill={pill}
              onLihatClick={() => {
                if (pill.runId) openRunInPanel(pill.runId);
                dismissPill(pill.clientId);
              }}
              onDismiss={() => dismissPill(pill.clientId)}
              onHoverChange={(hovered) => setPillHover(pill.clientId, hovered)}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
