import { expect, it } from 'vitest';
import { createInputController } from './input';
import type { NavigationState } from './types';

class Target extends EventTarget {
  activeElement: unknown = null;
  hidden = false;
  defaultView: Target | null = null;
  ownerDocument: Target | null = null;
  tabIndex = -1;
  focus() { if (this.ownerDocument) this.ownerDocument.activeElement = this; }
}
function fire(target: EventTarget, type: string, properties: object = {}) {
  const event = new Event(type, { cancelable: true });
  Object.assign(event, properties);
  target.dispatchEvent(event);
  return event;
}
it('handles canvas input, suppresses editable shortcuts and clears held keys on blur', () => {
  const canvas = new Target(), document = new Target(), window = new Target();
  canvas.ownerDocument = document; document.defaultView = window;
  const input = createInputController(canvas as unknown as HTMLCanvasElement);
  fire(canvas, 'pointerdown', { button: 2 });
  fire(window, 'keydown', { code: 'KeyW' });
  expect(input.readInput().localMove[2]).toBe(1);
  fire(window, 'blur');
  expect(input.readInput().localMove).toEqual([0, 0, 0]);
  document.activeElement = { tagName: 'INPUT' };
  fire(window, 'keydown', { code: 'KeyW' });
  expect(input.readInput().localMove).toEqual([0, 0, 0]);
  document.activeElement = canvas;
  fire(canvas, 'pointerdown', { button: 2 });
  fire(canvas, 'pointermove', { movementX: 20, movementY: 10 });
  expect(input.readInput().lookDelta).toEqual([20, 10]);
  expect(input.readInput().lookDelta).toEqual([0, 0]);
  fire(canvas, 'wheel', { deltaY: -100 });
  expect(input.readInput().speedSteps).toBe(1);
  document.hidden = true;
  fire(document, 'visibilitychange');
  expect(input.readInput().localMove).toEqual([0, 0, 0]);
  input.dispose();
  fire(window, 'keydown', { code: 'KeyW' });
  expect(input.readInput().localMove).toEqual([0, 0, 0]);
});
it('accepts Escape and movement after a HUD button without stealing focus', () => {
  const canvas = new Target(), document = new Target(), window = new Target();
  canvas.ownerDocument = document; document.defaultView = window;
  const input = createInputController(canvas as unknown as HTMLCanvasElement);
  const button = { tagName: 'BUTTON' };
  document.activeElement = button;
  fire(window, 'keydown', { code: 'Escape' });
  expect(input.readInput().cancel).toBe(true);
  fire(window, 'keydown', { code: 'KeyW' });
  expect(input.readInput().localMove[2]).toBe(1);
  expect(document.activeElement).toBe(button);
  input.dispose();
});
it('does not accept navigation in modal controls or while the UI disables input', () => {
  const canvas = new Target(), document = new Target(), window = new Target();
  canvas.ownerDocument = document; document.defaultView = window;
  let allowed = false;
  const input = createInputController(canvas as unknown as HTMLCanvasElement, () => allowed);
  document.activeElement = canvas;
  fire(window, 'keydown', { code: 'KeyW' });
  fire(window, 'keydown', { code: 'Escape' });
  expect(input.readInput()).toMatchObject({ localMove: [0, 0, 0], cancel: false });
  allowed = true;
  document.activeElement = { tagName: 'BUTTON', closest: (selector: string) => selector.includes('dialog') ? {} : null };
  fire(window, 'keydown', { code: 'Escape' });
  expect(input.readInput().cancel).toBe(false);
  document.activeElement = { tagName: 'TEXTAREA' };
  fire(window, 'keydown', { code: 'KeyW' });
  expect(input.readInput().localMove).toEqual([0, 0, 0]);
  input.dispose();
});
it('does not reuse a panel-closing Escape after an earlier listener enables navigation', () => {
  const canvas = new Target(), document = new Target(), window = new Target();
  canvas.ownerDocument = document; document.defaultView = window;
  document.activeElement = { tagName: 'BUTTON' };
  let panelOpen = true;
  window.addEventListener('keydown', event => {
    if (panelOpen) {
      event.preventDefault();
      panelOpen = false;
    }
  });
  const input = createInputController(canvas as unknown as HTMLCanvasElement, () => !panelOpen);
  fire(window, 'keydown', { code: 'Escape' });
  expect(panelOpen).toBe(false);
  expect(input.readInput().cancel).toBe(false);
  fire(window, 'keydown', { code: 'Escape' });
  expect(input.readInput().cancel).toBe(true);
  input.dispose();
});

it('uses left drag only for orbit and right drag for free/follow modes', () => {
  const canvas = new Target(), document = new Target(), window = new Target();
  canvas.ownerDocument = document; document.defaultView = window;
  let mode: NavigationState['mode'] = 'orbit';
  const input = createInputController(canvas as unknown as HTMLCanvasElement, () => true, () => mode);
  const drag = (button: number) => {
    fire(canvas, 'pointerdown', { button, pointerId: 1, clientX: 100, clientY: 100 });
    fire(canvas, 'pointermove', { pointerId: 1, clientX: 120, clientY: 110, movementX: 20, movementY: 10 });
    fire(window, 'pointerup', { button, pointerId: 1 });
    return input.readInput().lookDelta;
  };
  expect(drag(0)).toEqual([20, 10]);
  expect(drag(2)).toEqual([0, 0]);
  mode = 'free';
  expect(drag(0)).toEqual([0, 0]);
  expect(drag(2)).toEqual([20, 10]);
  mode = 'follow';
  expect(drag(2)).toEqual([20, 10]);
  input.dispose();
});

it('keeps click jitter still and stops dragging on mode changes and cancellation', () => {
  const canvas = new Target(), document = new Target(), window = new Target();
  canvas.ownerDocument = document; document.defaultView = window;
  let mode: NavigationState['mode'] = 'orbit';
  const input = createInputController(canvas as unknown as HTMLCanvasElement, () => true, () => mode);
  fire(canvas, 'pointerdown', { button: 0, pointerId: 1, clientX: 100, clientY: 100 });
  fire(canvas, 'pointermove', { pointerId: 1, clientX: 102, clientY: 101, movementX: 2, movementY: 1 });
  expect(input.readInput().lookDelta).toEqual([0, 0]);
  fire(canvas, 'pointermove', { pointerId: 1, clientX: 120, clientY: 110, movementX: 18, movementY: 9 });
  expect(input.readInput().lookDelta).toEqual([20, 10]);
  mode = 'free';
  fire(canvas, 'pointermove', { pointerId: 1, clientX: 140, clientY: 120, movementX: 20, movementY: 10 });
  expect(input.readInput().lookDelta).toEqual([0, 0]);
  fire(canvas, 'pointerdown', { button: 2, pointerId: 1, clientX: 140, clientY: 120 });
  fire(canvas, 'pointercancel', { pointerId: 1 });
  fire(canvas, 'pointermove', { pointerId: 1, clientX: 160, clientY: 130, movementX: 20, movementY: 10 });
  expect(input.readInput().lookDelta).toEqual([0, 0]);
  input.dispose();
});
