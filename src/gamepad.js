const PRESS_THRESHOLD = .55;
const RELEASE_THRESHOLD = .35;

export function readGamepad(previousStick = null) {
  let pads;
  try {
    pads = navigator.getGamepads?.() ?? [];
  } catch {
    return null;
  }
  const pad = pads.find(candidate => candidate?.connected && candidate.mapping === 'standard');
  if (!pad) return null;

  const axis = pad.axes[0] ?? 0;
  const pressed = index => pad.buttons[index]?.pressed === true;
  let stick = null;
  if (axis <= -(previousStick === 'left' ? RELEASE_THRESHOLD : PRESS_THRESHOLD)) stick = 'left';
  if (axis >= (previousStick === 'right' ? RELEASE_THRESHOLD : PRESS_THRESHOLD)) stick = 'right';
  const left = pressed(14);
  const right = pressed(15);
  const direction = left === right ? stick : left ? 'left' : 'right';

  return {
    stick, direction,
    confirm: pressed(0),
    cancel: pressed(1),
    pause: pressed(9),
    throw: pressed(3) || pressed(12),
    fast: pressed(13) || pressed(7)
  };
}
