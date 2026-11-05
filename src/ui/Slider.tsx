import { useEffect, useRef, useState } from 'react';
import { hueToRgb, type Control } from '../engine/recipe';

interface Props {
  control: Control;
  value: number;
  /** Live update while dragging. */
  onInput: (v: number) => void;
  /** Gesture finished: record one history entry. */
  onCommit: (v: number) => void;
  label?: string;
  min?: number;
  max?: number;
  defaultValue?: number;
}

function format(c: Control, v: number) {
  const digits = c.step < 1 ? 2 : 0;
  const s = v.toFixed(digits);
  const signed = c.min < 0 && v > 0 ? '+' + s : s;
  return c.unit && c.unit !== 'EV' ? signed + c.unit : signed;
}

function track(c: Control, pct: number, bipolar: boolean): string {
  if (c.track === 'temperature') return 'linear-gradient(90deg, #3B6FD8, #9AA3AE 50%, #E0B23A)';
  if (c.track === 'tint') return 'linear-gradient(90deg, #3FA34D, #9AA3AE 50%, #C246B5)';
  if (c.track === 'saturation') return 'linear-gradient(90deg, #8A8A8A, #C24E3A)';
  if (c.track === 'hue') {
    const stops = Array.from({ length: 7 }, (_, i) => {
      const [r, g, b] = hueToRgb(i * 60);
      return `rgb(${r * 220},${g * 220},${b * 220}) ${(i / 6) * 100}%`;
    });
    return `linear-gradient(90deg, ${stops.join(',')})`;
  }
  const fill = 'var(--slider-fill)', rest = 'var(--slider-track)';
  if (bipolar) {
    const a = Math.min(50, pct), b = Math.max(50, pct);
    return `linear-gradient(90deg, ${rest} ${a}%, ${fill} ${a}%, ${fill} ${b}%, ${rest} ${b}%)`;
  }
  return `linear-gradient(90deg, ${fill} ${pct}%, ${rest} ${pct}%)`;
}

export function Slider({ control: c, value, onInput, onCommit, label, min = c.min, max = c.max, defaultValue = c.default }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  const [text, setText] = useState<string | null>(null);
  const latest = useRef(value);
  latest.current = value;

  useEffect(() => {
    const el = ref.current!;
    const done = () => onCommit(latest.current);
    el.addEventListener('change', done);
    return () => el.removeEventListener('change', done);
  }, [onCommit]);

  const pct = ((value - min) / (max - min)) * 100;
  const bipolar = min < 0 && max > 0;
  const name = label ?? c.label;

  const commitText = (raw: string) => {
    setText(null);
    let v = parseFloat(raw.trim().replace(/[^\d+\-.]/g, ''));
    if (!Number.isFinite(v)) return;
    v = Math.min(max, Math.max(min, Math.round(v / c.step) * c.step));
    onCommit(v);
  };

  return (
    <div className="slider" data-control-id={c.id}>
      <div className="slider-row">
        <button
          type="button"
          className="slider-label"
          title={`${c.meaning} Double-click to reset.`}
          onDoubleClick={() => onCommit(defaultValue)}
        >
          {name}
        </button>
        {value !== defaultValue && (
          <button type="button" className="slider-reset" aria-label={`Reset ${name}`} title={`Reset ${name}`} onClick={() => onCommit(defaultValue)}>
            Reset
          </button>
        )}
        <input
          className="slider-value"
          aria-label={`${name} value`}
          inputMode="decimal"
          value={text ?? format(c, value)}
          onFocus={e => { setText(format(c, value).replace(/[^\d+\-.]/g, '')); requestAnimationFrame(() => e.target.select()); }}
          onChange={e => setText(e.target.value)}
          onBlur={e => commitText(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') { setText(null); (e.target as HTMLInputElement).blur(); }
          }}
        />
      </div>
      <input
        ref={ref}
        type="range"
        className="slider-range"
        aria-label={name}
        min={min}
        max={max}
        step={c.step}
        value={value}
        style={{ background: track(c, pct, bipolar) }}
        onChange={e => onInput(parseFloat(e.target.value))}
        onDoubleClick={() => onCommit(defaultValue)}
      />
    </div>
  );
}
