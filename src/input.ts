// Twin sticks and desktop controls. Gesture scratch (which finger owns which stick, where it went down) is
// module-local: it changes on every pointermove and nothing binds it, so it never touches a store. The runtime reads
// the current Input once per frame and hands it to Actions.frame.
//
// Touch: a finger landing on the left half of the screen spawns the movement stick where it lands; on the right half,
// the aim stick (fires while pushed). Desktop: WASD/arrows move, holding the mouse button fires toward the cursor.
import { Graphics } from 'pixi.js';
import { layers, view } from './stage';
import { token } from './tokens';
import { LOOK } from './view/look';
import { IDLE, type Input } from './world';

/** Stick travel for a full push, design px. */
const STICK_R_PX = LOOK.STICK_REACH_PX;

type Stick = { id: number; ox: number; oy: number; x: number; y: number } | null;
let move: Stick = null, aim: Stick = null;
let mouse: { x: number; y: number; down: boolean } = { x: 0, y: 0, down: false };
const keys = new Set<string>();
const gfx = new Graphics();
layers.sticks.addChild(gfx);

export type InputHooks = {
  /** False when sticks shouldn't take fingers (menus, pause). */
  enabled: () => boolean;
  /** True when a point (CSS px in the canvas) lands on a tappable UI node: that touch belongs to the UI. */
  blocked: (x: number, y: number) => boolean;
  /** The wizard's position in CSS px (for mouse aim). */
  wizard: () => { x: number; y: number };
};

let hooks: InputHooks | null = null;

const design = (e: PointerEvent, el: HTMLElement) => { const r = el.getBoundingClientRect(); return { x: (e.clientX - r.left) / view.scale, y: (e.clientY - r.top) / view.scale, cx: e.clientX - r.left, cy: e.clientY - r.top }; };
const vec = (s: NonNullable<Stick>) => { const dx = (s.x - s.ox) / STICK_R_PX, dy = (s.y - s.oy) / STICK_R_PX, l = Math.hypot(dx, dy); return l > 1 ? { x: dx / l, y: dy / l } : { x: dx, y: dy }; };

export function startInput(el: HTMLElement, h: InputHooks) {
  hooks = h;
  const down = (e: PointerEvent) => {
    const p = design(e, el);
    if (e.pointerType === 'mouse') { mouse = { x: e.clientX, y: e.clientY, down: h.enabled() && !h.blocked(p.cx, p.cy) }; return; }
    if (!h.enabled() || h.blocked(p.cx, p.cy)) return;
    const s = { id: e.pointerId, ox: p.x, oy: p.y, x: p.x, y: p.y };
    if (p.x < view.width / 2) { if (!move) move = s; } else if (!aim) aim = s;
  };
  const moveEv = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') { mouse.x = e.clientX; mouse.y = e.clientY; return; }
    const p = design(e, el);
    for (const s of [move, aim]) if (s && s.id === e.pointerId) { s.x = p.x; s.y = p.y; }
  };
  const up = (e: PointerEvent) => {
    if (e.pointerType === 'mouse') { mouse.down = false; return; }
    if (move?.id === e.pointerId) move = null;
    if (aim?.id === e.pointerId) aim = null;
  };
  // Physical key positions, so WASD is ZQSD on AZERTY.
  const kd = (e: KeyboardEvent) => { keys.add(e.code); };
  const ku = (e: KeyboardEvent) => { keys.delete(e.code); };
  const blur = () => { keys.clear(); move = aim = null; mouse.down = false; };
  el.addEventListener('pointerdown', down);
  window.addEventListener('pointermove', moveEv);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
  window.addEventListener('keydown', kd);
  window.addEventListener('keyup', ku);
  window.addEventListener('blur', blur);
  return () => {
    el.removeEventListener('pointerdown', down);
    window.removeEventListener('pointermove', moveEv);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', up);
    window.removeEventListener('keydown', kd);
    window.removeEventListener('keyup', ku);
    window.removeEventListener('blur', blur);
    hooks = null;
  };
}

/** This frame's controls; also redraws the stick visuals. */
export function readInput(): Input {
  if (!hooks?.enabled()) { move = aim = null; drawSticks(); return IDLE; }
  let mx = 0, my = 0, a: Input['aim'] = null;
  if (move) ({ x: mx, y: my } = vec(move));
  const k = (...names: string[]) => names.some((n) => keys.has(n));
  const kx = (k('KeyD', 'ArrowRight') ? 1 : 0) - (k('KeyA', 'ArrowLeft') ? 1 : 0), ky = (k('KeyS', 'ArrowDown') ? 1 : 0) - (k('KeyW', 'ArrowUp') ? 1 : 0);
  if (kx || ky) { const l = Math.hypot(kx, ky); mx = kx / l; my = ky / l; }
  if (aim) a = vec(aim);
  else if (mouse.down) { const s = hooks.wizard(), dx = mouse.x - s.x, dy = mouse.y - s.y, l = Math.hypot(dx, dy) || 1; a = { x: dx / l, y: dy / l }; }
  drawSticks();
  return { mx, my, aim: a };
}

function drawSticks() {
  gfx.clear();
  for (const [s, col] of [[move, token('--moon')], [aim, token('--spell')]] as const) {
    if (!s) continue;
    const v = vec(s);
    gfx.circle(s.ox, s.oy, STICK_R_PX).fill({ color: col, alpha: 0.08 }).stroke({ color: col, alpha: 0.5, width: 2 });
    gfx.circle(s.ox + v.x * STICK_R_PX, s.oy + v.y * STICK_R_PX, LOOK.STICK_KNOB_PX).fill({ color: col, alpha: 0.35 }).stroke({ color: col, alpha: 0.9, width: 2 });
  }
}
