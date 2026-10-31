/** Latest-wins seeking. Every request gets an incrementing id; a completion is honoured only if it carries the newest id. */
export function createSeekState() {
  return { latest: 0, settled: 0, ms: 0 };
}

export function request(state, ms) {
  return { latest: state.latest + 1, settled: state.settled, ms };
}

/** Returns the new state; stale acknowledgements are ignored. */
export function acknowledge(state, id) {
  if (id !== state.latest) return state;
  return { ...state, settled: id };
}

export const isSettled = (state) => state.settled === state.latest;
