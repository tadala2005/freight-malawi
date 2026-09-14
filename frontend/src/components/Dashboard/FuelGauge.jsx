import React from 'react';

const CENTER_X = 100;
const CENTER_Y = 100;
const RADIUS = 80;

function polarToCartesian(cx, cy, radius, angleDeg) {
  const angleRad = (angleDeg * Math.PI) / 180;

  return {
    x: cx + radius * Math.cos(angleRad),
    y: cy - radius * Math.sin(angleRad),
  };
}

/*
 * Upper semicircle:
 * 180° = left
 * 90°  = top
 * 0°   = right
 *
 * SVG sweep flag = 1 draws the arc across the TOP.
 */
function arcPath(startAngle, endAngle) {
  const start = polarToCartesian(
    CENTER_X,
    CENTER_Y,
    RADIUS,
    startAngle
  );

  const end = polarToCartesian(
    CENTER_X,
    CENTER_Y,
    RADIUS,
    endAngle
  );

  const angleDifference = Math.abs(endAngle - startAngle);
  const largeArc = angleDifference > 180 ? 1 : 0;

  return [
    `M ${start.x} ${start.y}`,
    `A ${RADIUS} ${RADIUS} 0 ${largeArc} 1 ${end.x} ${end.y}`,
  ].join(' ');
}

function statusColor(percent) {
  if (percent > 50) return 'var(--fm-teal)';
  if (percent >= 25) return 'var(--fm-warning)';
  return 'var(--fm-red)';
}

export default function FuelGauge({
  percent = 0,
  litres = 0,
  capacity = 0,
}) {
  const numericPercent = Number(percent) || 0;
  const clamped = Math.max(0, Math.min(100, numericPercent));

  const numericLitres = Number(litres) || 0;
  const numericCapacity = Number(capacity) || 0;

  /*
   * Empty = left side (180°)
   * Full  = right side (0°)
   */
  const currentAngle = 180 - (clamped / 100) * 180;

  const color = statusColor(clamped);

  const ticks = [0, 25, 50, 75, 100];

  return (
    <div className="fuel-gauge">
      <svg
        viewBox="0 0 200 120"
        width="220"
        height="132"
        role="img"
        aria-label={`Fuel level ${clamped.toFixed(1)} percent`}
      >
        {/* Full background gauge */}
        <path
          d={arcPath(180, 0)}
          stroke="var(--fm-border)"
          strokeWidth="14"
          fill="none"
          strokeLinecap="round"
        />

        {/* Current fuel level */}
        {clamped > 0 && (
          <path
            d={arcPath(180, currentAngle)}
            stroke={color}
            strokeWidth="14"
            fill="none"
            strokeLinecap="round"
            style={{
              transition:
                'stroke 250ms ease, d 400ms ease',
            }}
          />
        )}

        {/* Tick marks */}
        {ticks.map((tick) => {
          const angle = 180 - (tick / 100) * 180;

          const outer = polarToCartesian(
            CENTER_X,
            CENTER_Y,
            RADIUS + 12,
            angle
          );

          const inner = polarToCartesian(
            CENTER_X,
            CENTER_Y,
            RADIUS - 2,
            angle
          );

          return (
            <line
              key={tick}
              x1={inner.x}
              y1={inner.y}
              x2={outer.x}
              y2={outer.y}
              stroke="var(--fm-muted)"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          );
        })}

        {/* Needle */}
        <g
          className="fuel-gauge-needle"
          style={{
            transformOrigin: `${CENTER_X}px ${CENTER_Y}px`,
            transform: `rotate(${90 - currentAngle}deg)`,
            transition: 'transform 400ms ease',
          }}
        >
          <line
            x1={CENTER_X}
            y1={CENTER_Y}
            x2={CENTER_X}
            y2={CENTER_Y - RADIUS + 18}
            stroke="var(--fm-navy)"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </g>

        {/* Needle pivot */}
        <circle
          cx={CENTER_X}
          cy={CENTER_Y}
          r="6"
          fill="var(--fm-navy)"
        />

        <circle
          cx={CENTER_X}
          cy={CENTER_Y}
          r="2.5"
          fill="var(--fm-white)"
        />
      </svg>

      <div
        className="fuel-gauge-value mono"
        style={{ color }}
      >
        {numericLitres.toFixed(1)} L
      </div>

      <div className="fuel-gauge-sub">
        {clamped.toFixed(1)}% &middot;{' '}
        {numericCapacity.toFixed(0)} L capacity
      </div>
    </div>
  );
}
