import { useState } from 'react';
import { CONTROL_BY_ID, CONTROLS, GRADE_RANGES, HSL_BANDS, LOCAL_CONTROLS, MAX_MASKS, type Control, type HslBand, type MaskShape } from '../engine/recipe';
import { suggestAuto } from '../agent';
import { brushLayers, commit, edit, getState, preview, setState, useStore, type Section } from '../store';
import { commitControl, inputControl, read, type Scope } from './controls';
import { Slider } from './Slider';
import { Curves } from './Curves';
import { Switch } from './Primitives';
import type { Histogram } from '../output';

export const SECTIONS: Section[] = ['Light', 'Color', 'Curve', 'Color mixer', 'Grading', 'Effects'];

function ControlSlider({ id, scope, label }: { id: string; scope: Scope; label?: string }) {
  const c = CONTROL_BY_ID.get(id)!;
  const v = useStore(s => read(s.recipe, scope, id));
  return (
    <Slider
      control={c}
      label={label}
      value={v}
      defaultValue={scope === 'global' ? c.default : 0}
      onInput={x => inputControl(scope, id, x)}
      onCommit={x => commitControl(scope, id, x)}
    />
  );
}

const ids = (group: string) => CONTROLS.filter(c => c.group === group).map(c => c.id);

function Auto() {
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="auto-row">
      <button
        className="btn-secondary sm"
        title="Sets Light and white balance values from the photo. Every value stays editable."
        onClick={() => {
          try { edit(suggestAuto(getState().recipe), 'Auto'); setError(null); } catch (e) { setError((e as Error).message); }
        }}
      >
        Auto
      </button>
      <span className="caption">{error ?? 'Sets starting values you can adjust'}</span>
    </div>
  );
}

function MixerPanel() {
  const [band, setBand] = useState<HslBand>('red');
  const b = HSL_BANDS.find(x => x.id === band)!;
  return (
    <>
      <div className="chips" role="tablist" aria-label="Color band">
        {HSL_BANDS.map(x => (
          <button key={x.id} role="tab" aria-selected={x.id === band} className="chip swatch-chip" onClick={() => setBand(x.id)} title={x.label} aria-label={x.label}>
            <span className="dot lg" style={{ background: `hsl(${x.hue} 75% 52%)` }} />
          </button>
        ))}
      </div>
      <p className="caption band-name">{b.label}</p>
      {(['hue', 'saturation', 'luminance'] as const).map(k => <ControlSlider key={k} id={`hsl.${band}.${k}`} scope="global" />)}
    </>
  );
}

function GradingPanel() {
  return (
    <>
      {GRADE_RANGES.map(r => {
        const hue = useStore(s => s.recipe.values[`grading.${r.id}.hue`] ?? 0);
        const sat = useStore(s => s.recipe.values[`grading.${r.id}.saturation`] ?? 0);
        return (
          <div key={r.id} className="grade-group">
            <p className="group-label">
              <span className="dot" style={{ background: sat > 0 ? `hsl(${hue} ${30 + sat * 0.6}% 55%)` : 'var(--slider-track)' }} />
              {r.label}
            </p>
            <ControlSlider id={`grading.${r.id}.hue`} scope="global" />
            <ControlSlider id={`grading.${r.id}.saturation`} scope="global" />
          </div>
        );
      })}
      <ControlSlider id="grading.balance" scope="global" />
      <ControlSlider id="grading.blending" scope="global" />
    </>
  );
}

export function SectionBody({ section, histogram }: { section: Section; histogram: Histogram | null }) {
  switch (section) {
    case 'Light': return <><Auto />{ids('Light').map(id => <ControlSlider key={id} id={id} scope="global" />)}</>;
    case 'Color': return <>{ids('Color').map(id => <ControlSlider key={id} id={id} scope="global" />)}</>;
    case 'Curve': return <Curves histogram={histogram} />;
    case 'Color mixer': return <MixerPanel />;
    case 'Grading': return <GradingPanel />;
    case 'Effects': return <>{ids('Effects').map(id => <ControlSlider key={id} id={id} scope="global" />)}</>;
  }
}

export function sectionChanged(section: Section): (s: ReturnType<typeof getState>) => boolean {
  return s => {
    const r = s.recipe;
    if (section === 'Curve') return Object.values(r.curves).some(p => p.length !== 2 || p[0][1] !== 0 || p[1][1] !== 1);
    const group = section === 'Color mixer' ? 'Color mixer' : section;
    return CONTROLS.some(c => c.group === group && (r.values[c.id] ?? c.default) !== c.default);
  };
}

/* ---------------------------------------------------------------- masks */

function defaultShape(type: MaskShape['type']): MaskShape {
  const img = getState().image!;
  const a = img.width / img.height;
  if (type === 'linear') return { type, from: [0.5, 0.15], to: [0.5, 0.55] };
  if (type === 'radial') return { type, center: [0.5, 0.5], radius: [a >= 1 ? 0.25 / a : 0.25, a >= 1 ? 0.25 : 0.25 * a], feather: 0.5 };
  return { type };
}

export function addMask(type: MaskShape['type']) {
  const res = edit([{ op: 'addMask', shape: defaultShape(type) }], `Add ${type} mask`);
  if (res.ok) setState({ selectedMask: res.createdMasks[0], overlay: true });
}

function MaskSettings({ id }: { id: string }) {
  const mask = useStore(s => s.recipe.masks.find(m => m.id === id));
  const brush = useStore(s => s.brush);
  if (!mask) return null;
  const amountControl: Control = { id: 'mask.amount', label: 'Amount', group: 'Light', min: 0, max: 100, default: 100, step: 1, unit: '%', meaning: 'How strongly this mask’s adjustments apply.' };
  const featherControl: Control = { id: 'mask.feather', label: 'Feather', group: 'Light', min: 0, max: 100, default: 50, step: 1, meaning: 'Softness of the edge.' };
  const setMask = (patch: Partial<typeof mask>) => {
    const r = getState().recipe;
    preview({ ...r, masks: r.masks.map(m => (m.id === id ? { ...m, ...patch } : m)) });
  };
  return (
    <>
      <Slider control={amountControl} value={mask.amount} onInput={v => setMask({ amount: v })} onCommit={v => { setMask({ amount: v }); commit(`Amount · ${mask.name}`); }} />
      {mask.shape.type === 'radial' && (
        <Slider
          control={featherControl}
          value={Math.round(mask.shape.feather * 100)}
          onInput={v => setMask({ shape: { ...(mask.shape as Extract<MaskShape, { type: 'radial' }>), feather: v / 100 } })}
          onCommit={v => { setMask({ shape: { ...(mask.shape as Extract<MaskShape, { type: 'radial' }>), feather: v / 100 } }); commit(`Feather · ${mask.name}`); }}
        />
      )}
      {mask.shape.type === 'brush' && (
        <div className="brush-tools">
          <div className="segmented" role="radiogroup" aria-label="Brush action">
            <button role="radio" aria-checked={!brush.erase} onClick={() => setState({ brush: { ...brush, erase: false } })}>Paint</button>
            <button role="radio" aria-checked={brush.erase} onClick={() => setState({ brush: { ...brush, erase: true } })}>Erase</button>
          </div>
          <Slider
            control={{ id: 'brush.size', label: 'Brush size', group: 'Light', min: 1, max: 40, default: 6, step: 1, unit: '%', meaning: 'Diameter as a share of the photo’s longer edge. Shortcut: [ and ].' }}
            value={Math.round(brush.size * 100)}
            onInput={v => setState({ brush: { ...brush, size: v / 100 } })}
            onCommit={v => setState({ brush: { ...brush, size: v / 100 } })}
          />
          <Slider
            control={{ ...featherControl, id: 'brush.feather', default: 60 }}
            value={Math.round(brush.feather * 100)}
            onInput={v => setState({ brush: { ...brush, feather: v / 100 } })}
            onCommit={v => setState({ brush: { ...brush, feather: v / 100 } })}
          />
          <button className="btn-tertiary sm" onClick={() => { brushLayers.get(id)?.clear(); setState({ brushVersion: getState().brushVersion + 1 }); commit(`Clear brush · ${mask.name}`, 'You', [id]); }}>
            Clear brush
          </button>
          <p className="caption">Paint on the photo. On touch, one finger paints.</p>
        </div>
      )}
      <p className="group-label">Adjustments</p>
      {LOCAL_CONTROLS.map(c => <ControlSlider key={c.id} id={c.id} scope={id} />)}
    </>
  );
}

export function MaskPanel() {
  const masks = useStore(s => s.recipe.masks);
  const selected = useStore(s => s.selectedMask);
  const overlay = useStore(s => s.overlay);
  const full = masks.length >= MAX_MASKS;
  return (
    <div className="mask-panel">
      {!selected && <div className="add-mask">
        <p className="group-label">Add mask</p>
        <div className="row-gap wrap">
          {(['linear', 'radial', 'brush'] as const).map(t => (
            <button key={t} className="btn-secondary sm" disabled={full} onClick={() => addMask(t)}>
              {t === 'linear' ? 'Linear gradient' : t === 'radial' ? 'Radial gradient' : 'Brush'}
            </button>
          ))}
        </div>
        {full && <p className="caption">This version supports {MAX_MASKS} masks. Delete one to add another.</p>}
        <p className="caption muted">Select subject and Select sky are planned next.</p>
      </div>}
      {masks.length > 0 && (
        <ul className="mask-list" aria-label="Masks">
          {masks.map(m => (
            <li key={m.id} className={m.id === selected ? 'is-selected' : ''}>
              <button className="mask-name" aria-pressed={m.id === selected} onClick={() => setState({ selectedMask: m.id === selected ? null : m.id })}>
                {m.name}{m.invert ? ' · inverted' : ''}
              </button>
              <button className="btn-tertiary sm" onClick={() => edit([{ op: 'updateMask', id: m.id, invert: !m.invert }], `${m.invert ? 'Uninvert' : 'Invert'} ${m.name}`)}>Invert</button>
              <button className="btn-danger-tertiary sm" onClick={() => { edit([{ op: 'removeMask', id: m.id }], `Delete ${m.name}`); if (selected === m.id) setState({ selectedMask: null }); }}>Delete</button>
            </li>
          ))}
        </ul>
      )}
      {masks.length > 0 && (
        <Switch checked={overlay} onChange={v => setState({ overlay: v })} hint={<span className="kbd" aria-hidden>O</span>}>
          Show mask overlay
        </Switch>
      )}
      {selected && <MaskSettings id={selected} />}
    </div>
  );
}

/* ----------------------------------------------------------------- crop */

export const ASPECTS: { id: string; label: string; ratio: number | null | 'original' }[] = [
  { id: 'free', label: 'Free', ratio: null },
  { id: 'original', label: 'Original', ratio: 'original' },
  { id: '1:1', label: '1:1', ratio: 1 },
  { id: '4:5', label: '4:5', ratio: 4 / 5 },
  { id: '3:2', label: '3:2', ratio: 3 / 2 },
  { id: '16:9', label: '16:9', ratio: 16 / 9 },
  { id: '9:16', label: '9:16', ratio: 9 / 16 },
];

export function CropPanel({ aspect, setAspect }: { aspect: string; setAspect: (a: string) => void }) {
  const g = useStore(s => s.recipe.geometry);
  const img = useStore(s => s.image)!;
  const applyAspect = (id: string) => {
    setAspect(id);
    const a = ASPECTS.find(x => x.id === id)!;
    if (a.ratio === null) return;
    const [ow, oh] = g.rotate % 2 ? [img.height, img.width] : [img.width, img.height];
    const ratio = a.ratio === 'original' ? ow / oh : a.ratio;
    // Largest centered crop with this ratio, in normalized oriented coordinates.
    let w = 1, h = (ow / ratio) / oh;
    if (h > 1) { h = 1; w = (oh * ratio) / ow; }
    edit([{ op: 'setGeometry', crop: { x: (1 - w) / 2, y: (1 - h) / 2, w, h } }], `Crop ${a.label}`);
  };
  return (
    <div className="crop-panel">
      <p className="group-label">Aspect ratio</p>
      <div className="chips wrap" role="radiogroup" aria-label="Aspect ratio">
        {ASPECTS.map(a => (
          <button key={a.id} role="radio" aria-checked={a.id === aspect} className="chip" onClick={() => applyAspect(a.id)}>{a.label}</button>
        ))}
      </div>
      <p className="group-label">Rotate and flip</p>
      <div className="row-gap wrap">
        <button className="btn-secondary sm" onClick={() => { setAspect('free'); edit([{ op: 'setGeometry', rotate: ((g.rotate + 3) % 4) as 0 | 1 | 2 | 3 }], 'Rotate left'); }}>Rotate left</button>
        <button className="btn-secondary sm" onClick={() => { setAspect('free'); edit([{ op: 'setGeometry', rotate: ((g.rotate + 1) % 4) as 0 | 1 | 2 | 3 }], 'Rotate right'); }}>Rotate right</button>
        <button className="btn-secondary sm" onClick={() => edit([{ op: 'setGeometry', flipH: !g.flipH }], 'Flip')}>Flip</button>
      </div>
      <button className="btn-tertiary sm" onClick={() => { setAspect('free'); edit([{ op: 'reset', scope: 'geometry' }], 'Reset crop'); }}>Reset crop and rotation</button>
      <p className="caption">Drag the corners or the frame on the photo. Masks stay attached to the photo.</p>
    </div>
  );
}
