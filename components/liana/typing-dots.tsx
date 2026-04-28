import { cn } from "@/lib/utils";

interface TypingDotsProps {
  className?: string;
  /** Tailwind size class for individual dot. Default 'size-1.5'. */
  dotClassName?: string;
}

/**
 * Animated 3-dot typing indicator (à la Telegram / WhatsApp).
 *
 * CSS-only animation — no React state, no JS timer. Renders sebagai
 * inline-flex span supaya sit naturally next to text.
 *
 * Pakai `animate-bounce` Tailwind dengan staggered animation-delay
 * (-0.3s, -0.15s, 0s) untuk klasik typing-indicator effect.
 *
 * Usage:
 *   <span>Liana sedang mengetik <TypingDots /></span>
 */
export function TypingDots({ className, dotClassName }: TypingDotsProps) {
  return (
    <span
      className={cn("inline-flex items-end gap-0.5", className)}
      aria-label="sedang mengetik"
      role="status"
    >
      <span
        className={cn(
          "size-1.5 rounded-full bg-current animate-bounce [animation-delay:-0.3s]",
          dotClassName,
        )}
      />
      <span
        className={cn(
          "size-1.5 rounded-full bg-current animate-bounce [animation-delay:-0.15s]",
          dotClassName,
        )}
      />
      <span
        className={cn(
          "size-1.5 rounded-full bg-current animate-bounce",
          dotClassName,
        )}
      />
    </span>
  );
}
