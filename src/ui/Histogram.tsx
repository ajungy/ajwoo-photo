import type { Stats } from '../output';

export function HistogramView({ stats }: { stats: Stats | null }) {
  const W = 256, H = 64;
  const path = (a: number[]) => 'M0,' + H + a.map((v, i) => `L${((i + 0.5) / a.length) * W},${H - v * H}`).join('') + `L${W},${H}Z`;
  return (
    <div className="histogram">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Histogram of the edited photo">
        {stats && (
          <g style={{ mixBlendMode: 'screen' }}>
            <path d={path(stats.histogram.r)} fill="rgba(229,72,77,0.55)" />
            <path d={path(stats.histogram.g)} fill="rgba(48,164,108,0.55)" />
            <path d={path(stats.histogram.b)} fill="rgba(62,99,221,0.55)" />
          </g>
        )}
      </svg>
      <div className="histogram-meta caption">
        <span title="Share of pixels that are pure black">{stats ? `Shadows clipped ${stats.clippedShadowsPct.toFixed(1)}%` : '—'}</span>
        <span title="Share of pixels with a channel at full brightness">{stats ? `Highlights clipped ${stats.clippedHighlightsPct.toFixed(1)}%` : ''}</span>
      </div>
    </div>
  );
}
