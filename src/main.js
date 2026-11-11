import '@fontsource-variable/geist/wght.css';
import '@fontsource/space-mono/latin-400.css';
import '@fontsource/space-mono/latin-700.css';
import './style.css';
import { DIFFICULTIES, Game, LANES, MAX_DROPS, TILES } from './game.js';
import { StageScene } from './scene.js';
import { GameAudio, TRACKS } from './audio.js';

const byId = id => document.getElementById(id);
const viewport = byId('viewport');
const stage = viewport.closest('.stage');
const stageStatus = byId('stage-status');
const nowPlaying = byId('now-playing');
const trackName = byId('track-name');
const screen = byId('screen');
const play = byId('play');
const difficulty = byId('difficulty');
const sound = byId('sound');
const pause = byId('pause');
const fullscreen = byId('fullscreen');
const guide = byId('guide');
const touchControls = [...document.querySelectorAll('[data-action]')];
const dropSlots = [...byId('drops').children];
const paddleSlots = [...byId('paddle-slots').children];
const scoreText = score => String(score).padStart(6, '0');
const keys = {
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  Space: 'place', ArrowUp: 'throw', KeyW: 'throw', ArrowDown: 'fast', KeyS: 'fast'
};
const MOVE_INTERVAL = 1 / 7;
const KEY_REPEAT_DELAY = .28;
const DRAG_SLOP = 10;
const HOLD_DELAY = 280;

let scene;
let endReason;
let lastTime;
let fastPointer = null;
let lastBeat = 0;
let dragPointer = null;
let directionButton = null;
let destination = null;
let movement = null;
let moveIn = 0;
let repeatIn = 0;
const moveKeys = new Set();
const queuedMoves = [];
const fastKeys = new Set();
const gestures = new Map();
const audio = new GameAudio(byId('bgm'), readStorage('sound') !== 'off');
let best = Number(readStorage('best')) || 0;
const game = new Game(onGameEvent);

function readStorage(key) {
  try {
    // Keep scores and preferences from earlier builds on the same origin.
    return localStorage.getItem(`tile-flow.${key}`) ?? localStorage.getItem(`klax-prism.${key}`);
  } catch {
    return null;
  }
}

function saveStorage(key, value) {
  try { localStorage.setItem(`tile-flow.${key}`, value); } catch { /* Storage can be disabled. */ }
}

function updateHUD() {
  byId('wave-number').textContent = String(game.wave).padStart(2, '0');
  byId('wave-name').textContent = game.waveData.title;
  byId('goal-label').textContent = game.waveData.label;
  const progress = Math.min(game.progress, game.waveData.target);
  byId('goal-value').textContent = `${progress} / ${game.waveData.target}`;
  byId('goal-fill').style.width = `${100 * progress / game.waveData.target}%`;
  byId('goal-track').setAttribute('aria-valuemax', game.waveData.target);
  byId('goal-track').setAttribute('aria-valuenow', progress);
  byId('score').textContent = scoreText(game.score);
  byId('best').textContent = scoreText(best);
  dropSlots.forEach((slot, i) => slot.classList.toggle('lost', i >= MAX_DROPS - game.drops));
  byId('drops').setAttribute('aria-label', `落とせるタイル 残り${MAX_DROPS - game.drops}枚`);
  const stack = game.stack.map(tile => TILES[tile.color]);
  paddleSlots.forEach((slot, i) => {
    const tile = stack[i];
    slot.classList.toggle('filled', Boolean(tile));
    slot.textContent = tile?.symbol ?? '';
    if (tile) slot.style.setProperty('--tile', tile.color);
    else slot.style.removeProperty('--tile');
  });
  byId('paddle-count').textContent = `${stack.length} / 5`;
  byId('paddle-slots').setAttribute('aria-label', `パドル ${stack.length} / 5 ${stack.map(t => t.name).join('、')}`);
}

function updateScreen() {
  const phase = scene ? game.phase : 'error';
  stage.dataset.phase = phase;
  const status = { ready: 'STANDBY', playing: 'IN PLAY', paused: 'PAUSED', clear: 'WAVE CLEAR', over: 'GAME OVER', error: 'WEBGL ERROR' };
  stageStatus.textContent = status[phase];
  screen.hidden = phase === 'playing';
  difficulty.hidden = phase !== 'ready' && phase !== 'over';
  const title = byId('screen-title');
  title.hidden = phase === 'ready' || phase === 'playing';
  title.textContent = status[phase];
  const messages = {
    clear: `ウェーブ ${game.wave} 達成　／　SCORE ${scoreText(game.score)}`,
    over: `${endReason === 'full' ? '全てのマスが埋まりました' : 'タイルを3枚落としました'}　／　SCORE ${scoreText(game.score)}`,
    error: '3D描画を開始できませんでした。WebGL 2を利用できるブラウザで開いてください。'
  };
  const message = byId('screen-message');
  message.hidden = !messages[phase];
  message.textContent = messages[phase] ?? '';
  byId('play-label').textContent = { ready: 'START WAVE', paused: 'RESUME', clear: 'NEXT WAVE', over: 'PLAY AGAIN' }[phase] ?? '';
  play.hidden = phase === 'error';
  byId('keyboard-hint').hidden = phase === 'error';
  byId('keyboard-hint').lastChild.textContent = {
    ready: ' でスタート', paused: ' で再開', clear: ' で次へ', over: ' でもう一度'
  }[phase] ?? '';
  pause.disabled = phase !== 'playing' && phase !== 'paused';
  const pauseLabel = phase === 'paused' ? '再開' : '一時停止';
  pause.setAttribute('aria-label', pauseLabel);
  pause.title = `${pauseLabel} (Esc)`;
  pause.querySelector('use').setAttribute('href', phase === 'paused' ? '#i-play' : '#i-pause');
  for (const button of touchControls) button.disabled = phase !== 'playing';
}

function announce(text) {
  const display = byId('announce');
  display.textContent = text;
  display.classList.remove('show');
  void display.offsetWidth;
  display.classList.add('show');
}

function updateSound() {
  sound.setAttribute('aria-pressed', audio.enabled);
  sound.querySelector('use').setAttribute('href', audio.enabled ? '#i-sound' : '#i-mute');
}

function toggleSound() {
  audio.setEnabled(!audio.enabled);
  saveStorage('sound', audio.enabled ? 'on' : 'off');
  updateSound();
}

function releaseInputs() {
  moveKeys.clear();
  queuedMoves.length = 0;
  fastKeys.clear();
  gestures.clear();
  movement = null;
  moveIn = 0;
  repeatIn = 0;
  fastPointer = null;
  dragPointer = null;
  directionButton = null;
  destination = null;
  showFast(false);
}

function showFast(fast) {
  if (stage.hasAttribute('data-fast') === fast) return;
  stage.toggleAttribute('data-fast', fast);
  if (game.phase === 'playing') stageStatus.textContent = fast ? 'FAST FORWARD' : 'IN PLAY';
}

function showTrack(title) {
  trackName.textContent = title;
  nowPlaying.classList.remove('show');
  void nowPlaying.offsetWidth;
  nowPlaying.classList.add('show');
}

function onGameEvent(type, data) {
  if (type === 'tumble') {
    audio.event(type, data);
    return;
  }
  scene.event(type, data, game);
  if (game.score > best) {
    best = game.score;
    saveStorage('best', best);
  }
  if (type === 'match') {
    let label = 'FLOW';
    if (data.chain > 1) label = `${data.chain}× CHAIN`;
    else if (data.lines > 1) label = `${data.lines}× FLOW`;
    else if (data.longest > 3) label = `${data.longest} TILE FLOW`;
    announce(`${label} +${data.total}`);
    byId('status-live').textContent = `${label}、${data.total}点`;
  }
  if (type === 'miss') {
    announce('TILE MISSED');
    byId('status-live').textContent = `タイルを落としました。残り${MAX_DROPS - game.drops}枚。`;
  }
  if (type === 'blocked') announce('FULL');
  if (type === 'start') {
    byId('announce').classList.remove('show');
    if (data.newRun || data.refillDrops) showTrack(audio.nextTrack().title);
    byId('status-live').textContent = `ウェーブ ${game.wave}、${game.waveData.label} ${game.waveData.target}`;
  }
  if (type === 'over') {
    endReason = data.reason;
    byId('status-live').textContent = `ゲーム終了。スコア ${game.score}`;
  }
  if (type === 'clear') byId('status-live').textContent = `ウェーブ ${game.wave} 達成`;
  if (['start', 'playing', 'paused', 'over', 'clear'].includes(type)) {
    releaseInputs();
    updateScreen();
    audio.setRunning(game.phase === 'playing' || game.phase === 'clear', game.wave);
    if (game.phase === 'playing') stage.focus({ preventScroll: true });
    else if (!guide.open && !document.hidden) play.focus({ preventScroll: true });
  }
  audio.event(type, data);
  if (type !== 'move' && type !== 'blocked' && type !== 'spawn') updateHUD();
}

function activate() {
  if (!scene || game.phase === 'playing') return;
  void audio.unlock();
  if (game.phase === 'paused') game.pause();
  else game.begin(difficulty.querySelector(':checked')?.value);
}

function runAction(action) {
  if (guide.open) return;
  if (action === 'left') game.move(-1);
  if (action === 'right') game.move(1);
  if (action === 'place') game.place();
  if (action === 'throw') game.throwBack();
}

function syncMovement() {
  const next = keys[[...moveKeys].at(-1)] ?? null;
  if (next === movement) return;
  movement = next;
  repeatIn = movement ? KEY_REPEAT_DELAY : 0;
}

function movePaddle(direction) {
  const previous = game.lane;
  runAction(direction);
  if (game.lane === previous) return false;
  moveIn += MOVE_INTERVAL;
  return true;
}

function moveHeld() {
  if (moveIn > 0) return;
  while (queuedMoves.length) {
    if (movePaddle(queuedMoves.shift())) return;
  }
  if (movement) {
    if (repeatIn <= 0) movePaddle(movement);
    return;
  }
  let direction = directionButton?.action;
  if (!direction) {
    if (destination === game.lane) destination = null;
    const target = gestures.get(dragPointer)?.target ?? destination;
    if (target === null || target === game.lane) return;
    direction = target < game.lane ? 'left' : 'right';
  }
  movePaddle(direction);
}

function showGuide() {
  if (game.phase === 'playing') game.pause();
  guide.showModal();
}

play.addEventListener('click', activate);
const savedDifficulty = readStorage('difficulty');
if (Object.hasOwn(DIFFICULTIES, savedDifficulty)) {
  difficulty.querySelector(`[value="${savedDifficulty}"]`).checked = true;
}
difficulty.addEventListener('change', event => saveStorage('difficulty', event.target.value));
sound.addEventListener('click', toggleSound);
pause.addEventListener('click', () => game.pause());
byId('help').addEventListener('click', showGuide);
byId('mobile-help').addEventListener('click', showGuide);
byId('close-guide').addEventListener('click', () => guide.close());
byId('done-guide').addEventListener('click', () => guide.close());
const trackCredits = byId('track-credits');
for (const track of TRACKS) {
  const item = document.createElement('li');
  const link = document.createElement('a');
  link.href = track.source;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = track.title;
  item.append(link);
  trackCredits.append(item);
}
fullscreen.hidden = !document.fullscreenEnabled;
fullscreen.addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch {
    announce('全画面表示を開始できません');
  }
});
document.addEventListener('fullscreenchange', () => {
  fullscreen.setAttribute('aria-pressed', Boolean(document.fullscreenElement));
});

window.addEventListener('keydown', event => {
  if (guide.open || event.ctrlKey || event.metaKey || event.altKey) return;
  const onButton = event.target instanceof HTMLButtonElement;
  if (event.code === 'Enter' && game.phase !== 'playing' && !onButton && !event.repeat) {
    event.preventDefault();
    void activate();
  }
  if ((event.code === 'Escape' || event.code === 'KeyP') && !event.repeat && game.phase !== 'ready') {
    event.preventDefault();
    game.pause();
  }
  if (event.code === 'KeyM' && !event.repeat) toggleSound();
  const action = keys[event.code];
  if (!action || game.phase !== 'playing' || (event.code === 'Space' && onButton)) return;
  event.preventDefault();
  if (action === 'left' || action === 'right') {
    if (!event.repeat && !moveKeys.has(event.code)) {
      moveKeys.add(event.code);
      destination = null;
      syncMovement();
      if (queuedMoves.length < LANES - 1) queuedMoves.push(action);
      moveHeld();
    }
  } else if (action === 'fast') {
    if (!event.repeat) fastKeys.add(event.code);
  } else if (!event.repeat || action === 'place') {
    runAction(action);
  }
});
window.addEventListener('keyup', event => {
  if (moveKeys.delete(event.code)) syncMovement();
  fastKeys.delete(event.code);
});
window.addEventListener('blur', releaseInputs);
document.addEventListener('visibilitychange', () => {
  if (document.hidden && game.phase === 'playing') game.pause();
});

for (const button of touchControls) {
  const action = button.dataset.action;
  const direction = action === 'left' || action === 'right';
  if (action !== 'fast') {
    button.addEventListener('click', event => {
      if (direction && event.detail === 0) destination = null;
      if (!direction || event.detail === 0) runAction(action);
      stage.focus({ preventScroll: true });
    });
    if (!direction) continue;
  }
  button.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    button.setPointerCapture(event.pointerId);
    if (direction) {
      destination = null;
      directionButton = { id: event.pointerId, action };
      moveHeld();
    } else {
      fastPointer = event.pointerId;
    }
    stage.focus({ preventScroll: true });
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    button.addEventListener(type, event => {
      if (fastPointer === event.pointerId) fastPointer = null;
      if (directionButton?.id === event.pointerId) directionButton = null;
      if (type === 'pointerup' && game.phase === 'playing') stage.focus({ preventScroll: true });
    });
  }
}

viewport.addEventListener('pointerdown', event => {
  if (game.phase !== 'playing' || event.button !== 0) return;
  const { clientX: x, clientY: y } = event;
  gestures.set(event.pointerId, {
    x, y, lane: game.lane, action: scene.pointerAction(x, y), started: performance.now(), moved: false
  });
  viewport.setPointerCapture(event.pointerId);
  stage.focus({ preventScroll: true });
});
viewport.addEventListener('pointermove', event => {
  const pointer = gestures.get(event.pointerId);
  if (!pointer) return;
  const dx = event.clientX - pointer.x;
  const dy = event.clientY - pointer.y;
  if (Math.hypot(dx, dy) > DRAG_SLOP) pointer.moved = true;
  if (pointer.moved && dragPointer === null && Math.abs(dx) > Math.abs(dy)) {
    destination = null;
    dragPointer = event.pointerId;
  }
  if (dragPointer !== event.pointerId) return;
  const lanes = Math.round(dx / scene.pointerLaneWidth);
  pointer.target = Math.max(0, Math.min(LANES - 1, pointer.lane + lanes));
  moveHeld();
});
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  viewport.addEventListener(type, event => {
    const pointer = gestures.get(event.pointerId);
    gestures.delete(event.pointerId);
    if (dragPointer === event.pointerId) dragPointer = null;
    if (type !== 'pointerup' || !pointer?.action || pointer.moved) return;
    const { clientX: x, clientY: y } = event;
    if (Math.hypot(x - pointer.x, y - pointer.y) <= DRAG_SLOP && scene.pointerAction(x, y) === pointer.action) {
      if (pointer.action === 'paddle') {
        destination = scene.pointerLane(x);
        moveHeld();
      } else {
        runAction(pointer.action);
      }
    }
  });
}
viewport.addEventListener('contextmenu', event => {
  if (game.phase === 'playing') event.preventDefault();
});

function frame(now) {
  const dt = Math.min(.045, (now - (lastTime ?? now)) / 1000);
  lastTime = now;
  moveIn -= dt;
  repeatIn = Math.max(0, repeatIn - dt);
  moveHeld();
  moveIn = Math.max(0, moveIn);
  const fast = fastPointer !== null || fastKeys.size > 0 || [...gestures.values()].some(pointer =>
    pointer.action === null && !pointer.moved && now - pointer.started >= HOLD_DELAY
  );
  game.step(dt, fast);
  showFast(fast && !game.conveyorPaused && game.phase === 'playing');
  audio.tick();
  // Use the same music clock for the soft pulses along the ramp.
  if (audio.beat !== lastBeat) {
    if (!game.conveyorPaused) scene.tempo += .16;
    scene.beatGlow = 1;
    lastBeat = audio.beat;
  }
  scene.render(game, dt, fast);
  requestAnimationFrame(frame);
}

stage.tabIndex = -1;
try {
  scene = new StageScene(viewport);
  requestAnimationFrame(frame);
  viewport.addEventListener('webglcontextlost', () => {
    if (game.phase === 'playing') game.pause();
  }, true);
} catch (error) {
  console.error(error);
}
updateHUD();
updateSound();
updateScreen();
