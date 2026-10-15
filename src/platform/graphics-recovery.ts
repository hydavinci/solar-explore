export type GraphicsState = 'ready' | 'lost' | 'failed';
export function attachGraphicsRecovery(canvas: EventTarget, onState: (state: GraphicsState, error?: unknown) => void, restore: () => void) {
  let state: GraphicsState = 'ready', resumed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const lost = (event: Event) => {
    event.preventDefault();
    state = 'lost'; resumed = false;
    clearTimeout(timer);
    onState(state);
    timer = setTimeout(() => { state = 'failed'; onState(state); }, 10_000);
  };
  const restored = () => {
    clearTimeout(timer);
    try {
      restore();
      state = 'ready'; resumed = true; onState(state);
    } catch (error) {
      state = 'failed'; onState(state, error);
    }
  };
  canvas.addEventListener('webglcontextlost', lost);
  canvas.addEventListener('webglcontextrestored', restored);
  return {
    suspended: () => state !== 'ready',
    consumeResume: () => { const value = resumed; resumed = false; return value; },
    dispose: () => {
      clearTimeout(timer);
      canvas.removeEventListener('webglcontextlost', lost);
      canvas.removeEventListener('webglcontextrestored', restored);
    },
  };
}
