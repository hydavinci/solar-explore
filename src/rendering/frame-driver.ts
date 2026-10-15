import { EMPTY_INPUT } from '../navigation/controller';
import type { InputController } from '../navigation/input';
import type { Runtime } from './runtime';

export function advanceFrame(runtime: Runtime, input: InputController, delta: number, enabled: boolean, suspended: boolean, resumed: boolean) {
  if (suspended) { input.clearInput(); return runtime.getSnapshot(); }
  if (resumed) { input.clearInput(); delta = 0; }
  if (!enabled) input.clearInput();
  runtime.handleInput(enabled ? input.readInput() : EMPTY_INPUT, delta);
  return runtime.tick(delta);
}
