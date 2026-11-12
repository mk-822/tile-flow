const PRESS_THRESHOLD = .55;
const RELEASE_THRESHOLD = .35;

export function readGamepad(previousStick = null) {
  let pads;
  try {
    pads = navigator.getGamepads?.() ?? [];
  } catch {
    return null;
  }
  let pad = pads.find(candidate => candidate?.connected && candidate.mapping === 'standard');
  if (!pad && /\bChrome\//.test(navigator.userAgent) &&
      (navigator.userAgentData?.platform === 'Android' || /\bAndroid\b/.test(navigator.userAgent))) {
    // Android Chromium still fills the canonical slots for its default mapping.
    pad = pads.find(candidate => candidate?.connected && candidate.mapping === '' &&
      candidate.buttons.length >= 16 && candidate.axes.length >= 4);
  }
  if (!pad) return null;

  const axis = pad.axes[0] ?? 0;
  const pressed = index => pad.buttons[index]?.pressed === true;
  let stick = null;
  if (axis <= -(previousStick === 'left' ? RELEASE_THRESHOLD : PRESS_THRESHOLD)) stick = 'left';
  if (axis >= (previousStick === 'right' ? RELEASE_THRESHOLD : PRESS_THRESHOLD)) stick = 'right';
  const left = pressed(14);
  const right = pressed(15);
  const direction = left === right ? stick : left ? 'left' : 'right';
  const up = pressed(12);
  const down = pressed(13);

  return {
    stick, direction,
    menuVertical: Number(down) - Number(up),
    confirm: pressed(0),
    cancel: pressed(1),
    pause: pressed(9),
    throw: pressed(3) || up,
    fast: down || pressed(7)
  };
}
