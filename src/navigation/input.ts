import { EMPTY_INPUT } from './controller';
import type { NavigationInput, NavigationState } from './types';
export const DRAG_THRESHOLD_PX = 5;
export interface InputController { readInput(): NavigationInput; clearInput(): void; dispose(): void }
function editable(element: Element | null): boolean {
  if (!element) return false;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName) || (element as HTMLElement).isContentEditable === true || element.closest?.('[contenteditable="true"],[contenteditable=""]') != null;
}
export function createInputController(canvas: HTMLCanvasElement, inputEnabled: () => boolean = () => true,
  getMode: () => NavigationState['mode'] = () => 'free'): InputController {
  const document = canvas.ownerDocument, window = document.defaultView;
  const keys = new Set<string>(), disposers: (() => void)[] = [];
  let lookX = 0, lookY = 0, steps = 0, cancel = false, disposed = false;
  let drag: { id: number; button: number; mode: NavigationState['mode']; x: number; y: number; active: boolean } | null = null;
  const originalTabIndex = canvas.tabIndex;
  if (canvas.tabIndex < 0) canvas.tabIndex = 0;
  const clearInput = () => { keys.clear(); lookX = lookY = steps = 0; cancel = false; drag = null; };
  const bind = (target: EventTarget | null, name: string, listener: EventListener, options?: AddEventListenerOptions) => {
    target?.addEventListener(name, listener, options);
    disposers.push(() => target?.removeEventListener(name, listener, options));
  };
  const enabled = () => !disposed && !document.hidden && inputEnabled() && !editable(document.activeElement)
    && !document.activeElement?.closest?.('[role="dialog"],[aria-modal="true"]');
  bind(window, 'keydown', event => {
    const e = event as KeyboardEvent;
    if (e.defaultPrevented || !enabled() || e.metaKey || e.ctrlKey || e.altKey) return;
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'Escape'].includes(e.code)) {
      e.preventDefault(); keys.add(e.code); if (e.code === 'Escape') cancel = true;
    }
  });
  bind(window, 'keyup', e => keys.delete((e as KeyboardEvent).code));
  bind(window, 'blur', clearInput);
  bind(canvas, 'blur', clearInput);
  bind(document, 'visibilitychange', clearInput);
  bind(document, 'focusin', () => { if (!enabled()) clearInput(); });
  bind(canvas, 'pointerdown', event => {
    const e = event as PointerEvent;
    if (!inputEnabled()) return;
    canvas.focus();
    const mode = getMode();
    if (e.button === (mode === 'orbit' ? 0 : 2)) {
      drag = { id: e.pointerId, button: e.button, mode, x: e.clientX, y: e.clientY, active: e.button === 2 };
      e.preventDefault();
    }
  });
  bind(window, 'pointerup', event => { if ((event as PointerEvent).pointerId === drag?.id) drag = null; });
  bind(canvas, 'pointercancel', () => { drag = null; lookX = lookY = 0; });
  bind(canvas, 'pointermove', event => {
    const e = event as PointerEvent;
    if (!drag || e.pointerId !== drag.id || !enabled()) return;
    if (drag.mode !== getMode()) { drag = null; lookX = lookY = 0; return; }
    if (!drag.active) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.hypot(dx, dy) <= DRAG_THRESHOLD_PX) return;
      drag.active = true; lookX += dx; lookY += dy;
    } else { lookX += e.movementX; lookY += e.movementY; }
  });
  bind(canvas, 'contextmenu', e => e.preventDefault());
  bind(canvas, 'wheel', event => {
    const e = event as WheelEvent;
    if (!enabled()) return;
    e.preventDefault(); canvas.focus(); steps -= Math.sign(e.deltaY);
  }, { passive: false });
  return {
    readInput() {
      if (!enabled()) { clearInput(); return EMPTY_INPUT; }
      if (drag && drag.mode !== getMode()) { drag = null; lookX = lookY = 0; }
      const key = (code: string) => Number(keys.has(code));
      const result: NavigationInput = { localMove: [key('KeyD') - key('KeyA'), key('KeyE') - key('KeyQ'), key('KeyW') - key('KeyS')],
        lookDelta: [lookX, lookY], speedSteps: steps, cancel };
      lookX = lookY = steps = 0; cancel = false;
      return result;
    },
    clearInput,
    dispose() { disposed = true; clearInput(); disposers.forEach(dispose => dispose()); canvas.tabIndex = originalTabIndex; },
  };
}
