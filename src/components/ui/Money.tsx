import { useEffect, useRef, useState } from 'react';
import { formatCurrency } from '../../lib/format';

/** Skip the animation when motion is reduced, or the page is hidden (animation frames don't run then). */
function prefersReducedMotion() {
  if (typeof window === 'undefined') return true;
  return document.hidden || Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
}

/** Eases a number from its previous value (0 on first render) to the new one. */
function useCountUp(target: number, enabled: boolean) {
  const [value, setValue] = useState(enabled && !prefersReducedMotion() ? 0 : target);
  const fromRef = useRef(value);

  useEffect(() => {
    if (!enabled || prefersReducedMotion()) {
      setValue(target);
      return;
    }
    const from = fromRef.current;
    if (from === target) return;
    const duration = 600;
    const start = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = from + (target - from) * eased;
      fromRef.current = next;
      setValue(next);
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, enabled]);

  return value;
}

/** A currency amount with the cents set smaller, finance-app style ($1,284.50). */
export function Money({ amount, className = '', animate = false }: { amount: number; className?: string; animate?: boolean }) {
  const shown = useCountUp(amount, animate);
  const text = formatCurrency(shown);
  const dot = text.lastIndexOf('.');
  const whole = dot === -1 ? text : text.slice(0, dot);
  const cents = dot === -1 ? '' : text.slice(dot);
  return (
    <span className={`tabular-nums ${className}`}>
      {whole}
      <span className="text-[0.6em] font-semibold opacity-70">{cents}</span>
    </span>
  );
}
