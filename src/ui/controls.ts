import { CONTROL_BY_ID, value, type Recipe } from '../engine/recipe';
import { commit, getState, preview } from '../store';

/** Scope: the whole photo, or a mask id. */
export type Scope = 'global' | string;

export function read(recipe: Recipe, scope: Scope, id: string): number {
  if (scope === 'global') return value(recipe, id);
  return recipe.masks.find(m => m.id === scope)?.adjust[id] ?? 0;
}

export function write(recipe: Recipe, scope: Scope, id: string, v: number): Recipe {
  if (scope === 'global') return { ...recipe, values: { ...recipe.values, [id]: v } };
  return { ...recipe, masks: recipe.masks.map(m => (m.id === scope ? { ...m, adjust: { ...m.adjust, [id]: v } } : m)) };
}

export function inputControl(scope: Scope, id: string, v: number) {
  preview(write(getState().recipe, scope, id, v));
}

export function commitControl(scope: Scope, id: string, v: number) {
  preview(write(getState().recipe, scope, id, v));
  const c = CONTROL_BY_ID.get(id)!;
  const where = scope === 'global' ? '' : ` · ${getState().recipe.masks.find(m => m.id === scope)?.name ?? 'mask'}`;
  commit(`${c.group === 'Color mixer' ? 'Color mixer ' : ''}${c.label}${where}`);
}
