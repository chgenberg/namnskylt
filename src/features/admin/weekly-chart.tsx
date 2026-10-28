import { formatSek } from "@/features/orders/format";
import type { WeekBucket } from "@/lib/orders/stats";
import styles from "./admin.module.css";

const WIDTH = 720;
const HEIGHT = 240;
const PAD = { top: 24, right: 8, bottom: 28, left: 8 };

/** Staplar per vecka; den pågående veckan markeras så att den inte ser ut som ett tapp. */
export function WeeklyChart({ weeks }: { weeks: readonly WeekBucket[] }) {
  const max = Math.max(1, ...weeks.map((w) => w.revenueSek));
  const innerW = WIDTH - PAD.left - PAD.right;
  const innerH = HEIGHT - PAD.top - PAD.bottom;
  const slot = innerW / Math.max(1, weeks.length);
  const barW = Math.min(44, slot * 0.62);

  return (
    <svg className={styles.chart} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="Ordervärde per vecka">
      <defs>
        <linearGradient id="bar" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#57564f" />
          <stop offset="1" stopColor="#0a0a0b" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75, 1].map((t) => (
        <line
          key={t}
          x1={PAD.left}
          x2={WIDTH - PAD.right}
          y1={PAD.top + innerH * (1 - t)}
          y2={PAD.top + innerH * (1 - t)}
          stroke="#ecebe6"
          strokeDasharray="3 5"
        />
      ))}
      {weeks.map((week, i) => {
        const h = (week.revenueSek / max) * innerH;
        const x = PAD.left + slot * i + (slot - barW) / 2;
        const y = PAD.top + innerH - h;
        const current = i === weeks.length - 1;
        return (
          <g key={week.weekStart}>
            <title>{`${week.label}: ${formatSek(week.revenueSek)} · ${week.orders} ordrar`}</title>
            <rect
              x={x}
              y={week.revenueSek > 0 ? y : PAD.top + innerH - 2}
              width={barW}
              height={week.revenueSek > 0 ? h : 2}
              rx="8"
              fill={current ? "#d9b866" : "url(#bar)"}
              opacity={week.revenueSek > 0 ? 1 : 0.35}
            />
            {week.revenueSek > 0 && (
              <text x={x + barW / 2} y={y - 7} textAnchor="middle" fontSize="11" fill="#5b6270">
                {Math.round(week.revenueSek / 100) / 10}k
              </text>
            )}
            <text x={x + barW / 2} y={HEIGHT - 8} textAnchor="middle" fontSize="11" fill={current ? "#0a0a0b" : "#8a909a"} fontWeight={current ? 600 : 400}>
              {week.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
