"use client";

import { useEffect, useMemo, useState } from "react";
import { Calendar } from "lucide-react";

import {
  calculateCountdown,
  isCountdownComplete,
  resolveElectionTarget,
  type CountdownParts,
} from "@/lib/election-countdown";

/*
 * ============================================================
 * HOMEPAGE ELECTION COUNTDOWN
 * ============================================================
 *
 * Ported from the ifeanyi-2027 homepage countdown. The target is no
 * longer compiled in: the admin sets `site_settings/general.electionDate`
 * (Admin -> Settings -> Election Countdown) and this component counts
 * down to midnight WAT on that day. Before the admin sets one, the
 * build-time BRANDING seed is used, so a fresh clone still renders.
 *
 * The date is never calculated during render. The server and the first
 * client render both show zeros, and the effect fills in the real
 * numbers, which is what keeps hydration deterministic.
 */

function TimeBox({ value, label }: { value: number; label: string }) {
  return (
    <div className="min-w-0 flex-1 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-1.5 py-2.5 text-center">
      <div className="text-xl font-extrabold leading-none tracking-tight text-white sm:text-2xl">
        {String(value).padStart(2, "0")}
      </div>
      <div className="mt-1.5 text-[8px] font-bold uppercase tracking-wider text-emerald-200/80 sm:text-[9px]">
        {label}
      </div>
    </div>
  );
}

export default function ElectionCountdown({
  electionDate,
  className = "",
}: {
  /** "YYYY-MM-DD" from site settings; empty uses the branding seed. */
  electionDate?: string;
  className?: string;
}) {
  const target = useMemo(
    () => resolveElectionTarget(electionDate),
    [electionDate],
  );

  const [countdown, setCountdown] = useState<CountdownParts | null>(null);
  const [mounted, setMounted] = useState(false);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setMounted(true);

    const updateCountdown = () => {
      setCountdown(calculateCountdown(target.targetMs));
    };

    updateCountdown();
    const interval = window.setInterval(updateCountdown, 1000);

    return () => {
      window.clearInterval(interval);
    };
  }, [target.targetMs]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const showLoading = !mounted || countdown === null;
  const electionReached =
    countdown !== null && isCountdownComplete(countdown);

  return (
    <div className={`relative z-20 ${className}`}>
      <div className="w-full rounded-2xl border border-white/15 bg-emerald-950/95 p-3 text-white shadow-xl backdrop-blur-md md:p-4">
        {/* Election date */}
        <div className="mb-3 flex items-center gap-2.5 border-b border-white/10 pb-3">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-emerald-500/15">
            <Calendar className="h-4 w-4 text-emerald-300" />
          </div>

          <div className="min-w-0">
            <p className="text-[9px] font-semibold uppercase tracking-wider text-gray-300">
              Election Date
            </p>

            <p className="truncate text-xs font-bold text-emerald-300 sm:text-sm">
              {target.label}
            </p>
          </div>
        </div>

        {/* Countdown title */}
        <p className="mb-2.5 text-center text-[9px] font-semibold uppercase tracking-[0.18em] text-gray-300">
          Election Countdown
        </p>

        {showLoading ? (
          <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
            <TimeBox value={0} label="Days" />
            <TimeBox value={0} label="Hours" />
            <TimeBox value={0} label="Min" />
            <TimeBox value={0} label="Sec" />
          </div>
        ) : electionReached ? (
          <div className="rounded-xl bg-emerald-400/15 px-3 py-4 text-center">
            <p className="text-sm font-bold text-emerald-200">
              Election Day is Here!
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
            <TimeBox value={countdown.days} label="Days" />
            <TimeBox value={countdown.hours} label="Hours" />
            <TimeBox value={countdown.minutes} label="Min" />
            <TimeBox value={countdown.seconds} label="Sec" />
          </div>
        )}
      </div>
    </div>
  );
}
