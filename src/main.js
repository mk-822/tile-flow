import '@fontsource-variable/geist/wght.css';
import '@fontsource/space-mono/latin-400.css';
import '@fontsource/space-mono/latin-700.css';
import './style.css';
import { DIFFICULTIES, Game, LANES, TILES, WAVE_CHOICES } from './game.js';
import { StageScene } from './scene.js';
import { GameAudio, TRACKS } from './audio.js';
import { readGamepad } from './gamepad.js';

const byId = id => document.getElementById(id);
const viewport = byId('viewport');
const stage = viewport.closest('.stage');
const stageStatus = byId('stage-status');
const nowPlaying = byId('now-playing');
const trackName = byId('track-name');
const screen = byId('screen');
const play = byId('play');
const waveSelection = byId('wave-selection');
const startGrid = byId('start-grid');
const skipGrid = byId('skip-grid');
const volume = byId('volume');
const sound = byId('sound');
const pause = byId('pause');
const fullscreen = byId('fullscreen');
const guide = byId('guide');
const resultControls = [waveSelection, document.querySelector('.top-actions'), byId('help'), byId('mobile-help')];
const touchControls = [...document.querySelectorAll('[data-action]')];
const dropSlots = [...byId('drops').children];
const paddleSlots = [...byId('paddle-slots').children];
const scoreText = score => String(score).padStart(6, '0');
const keys = {
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  Space: 'place', ArrowUp: 'throw', KeyW: 'throw', ArrowDown: 'fast', KeyS: 'fast'
};
const menuDirections = {
  ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1]
};
const difficultyKeys = Object.keys(DIFFICULTIES);
const MOVE_INTERVAL = 1 / 7;
const MOVE_REPEAT_DELAY = .28;
const DRAG_SLOP = 10;
const HOLD_DELAY = 280;

let scene;
let endReason;
let lastTime;
let fastPointer = null;
let lastBeat = 0;
let dragPointer = null;
let padDirection = null;
let previousPad = null;
let destination = null;
let movement = null;
let moveIn = 0;
let repeatIn = 0;
let resultInputLocked = false;
let resultAnimationsDone = false;
const moveKeys = new Set();
const ignoredResultKeys = new Set();
const touchDirections = new Map();
const queuedMoves = [];
const fastKeys = new Set();
const gestures = new Map();
const audio = new GameAudio(byId('bgm'), readStorage('sound') !== 'off', Number(readStorage('volume') ?? 100) / 100);
const bestScores = Object.fromEntries(difficultyKeys.map(key => [key, Number(readStorage(`best.${key}`)) || 0]));
const savedDifficulty = readStorage('difficulty');
let startColumn = difficultyKeys.indexOf(Object.hasOwn(DIFFICULTIES, savedDifficulty) ? savedDifficulty : 'normal');
let startRow = 0;
let skipChoice = 0;
const startButtons = [];
const skipButtons = [];
const bestLabels = [];
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

function bonusText(bonus) {
  return `${bonus.toLocaleString('ja-JP')} BONUS`;
}

function choiceLabel(wave, { drops, bonus }) {
  return `WAVE ${wave}、DROP ${drops}${bonus ? `、${bonusText(bonus)}` : ''}`;
}

function makeChoice(text, select) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'wave-choice';
  button.setAttribute('role', 'radio');
  const label = document.createElement('span');
  label.textContent = text;
  button.append(label);
  button.addEventListener('click', select);
  return button;
}

function makeReward({ drops, bonus }) {
  const reward = document.createElement('span');
  reward.className = 'wave-reward';
  const limit = document.createElement('span');
  limit.textContent = `DROP ${drops}`;
  reward.append(limit);
  if (bonus) {
    const points = document.createElement('strong');
    points.textContent = bonusText(bonus);
    reward.append(points);
  }
  return reward;
}

function buildSelection() {
  for (const key of difficultyKeys) {
    const header = document.createElement('div');
    header.className = 'difficulty-heading';
    const label = document.createElement('span');
    label.textContent = DIFFICULTIES[key].label;
    const best = document.createElement('small');
    bestLabels.push(best);
    header.append(label, best);
    startGrid.append(header);
  }
  const heading = document.createElement('span');
  heading.className = 'reward-heading';
  heading.textContent = 'DROP / BONUS';
  startGrid.append(heading);

  WAVE_CHOICES.forEach((choice, row) => {
    const wave = 1 + choice.skip;
    difficultyKeys.forEach((key, column) => {
      const button = makeChoice(wave, () => chooseStart(column, row));
      button.setAttribute('aria-label', `${DIFFICULTIES[key].label}、${choiceLabel(wave, choice)}`);
      startButtons.push(button);
      startGrid.append(button);
    });
    startGrid.append(makeReward(choice));

    const button = makeChoice('', () => chooseSkip(row));
    const distance = document.createElement('small');
    distance.className = 'skip-distance';
    distance.textContent = choice.skip ? `${choice.skip} WAVE SKIP` : '次のWAVE';
    button.append(distance, makeReward(choice));
    skipButtons.push(button);
    skipGrid.append(button);
  });
}

function markChoice(buttons, selected) {
  const moveFocus = buttons.includes(document.activeElement);
  buttons.forEach((button, index) => {
    const checked = index === selected;
    button.setAttribute('aria-checked', checked);
    button.tabIndex = checked ? 0 : -1;
  });
  if (moveFocus) buttons[selected].focus({ preventScroll: true });
}

function chooseStart(column, row) {
  if (column !== startColumn) saveStorage('difficulty', difficultyKeys[column]);
  startColumn = column;
  startRow = row;
  markChoice(startButtons, row * difficultyKeys.length + column);
  updateBest();
}

function chooseSkip(index) {
  skipChoice = index;
  markChoice(skipButtons, index);
}

function moveSelection(horizontal, vertical) {
  if (waveSelection.hidden) return false;
  if (!startGrid.hidden) {
    const column = Math.max(0, Math.min(difficultyKeys.length - 1, startColumn + horizontal));
    const row = Math.max(0, Math.min(WAVE_CHOICES.length - 1, startRow + vertical));
    chooseStart(column, row);
  } else if (horizontal) {
    chooseSkip(Math.max(0, Math.min(WAVE_CHOICES.length - 1, skipChoice + horizontal)));
  }
  return true;
}

function updateBest() {
  const key = game.phase === 'ready' ? difficultyKeys[startColumn] : game.difficultyKey;
  byId('best').textContent = scoreText(bestScores[key]);
  difficultyKeys.forEach((difficulty, column) => {
    bestLabels[column].textContent = `BEST ${scoreText(bestScores[difficulty])}`;
  });
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
  updateBest();
  dropSlots.forEach((slot, i) => {
    slot.hidden = i >= game.dropLimit;
    slot.classList.toggle('lost', i >= game.dropsRemaining);
  });
  byId('drops').setAttribute('aria-label', `落とせるタイル 残り${game.dropsRemaining}枚`);
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
  if (phase !== 'playing') byId('wave-goal').classList.remove('show');
  const selectStart = phase === 'ready' || phase === 'over';
  const selectSkip = phase === 'clear' && game.canSkipWaves;
  waveSelection.hidden = !selectStart && !selectSkip;
  startGrid.hidden = !selectStart;
  skipGrid.hidden = !selectSkip;
  byId('start-heading').hidden = !selectStart;
  if (selectStart || selectSkip) stage.dataset.select = selectStart ? 'start' : 'skip';
  else delete stage.dataset.select;
  if (selectStart) markChoice(startButtons, startRow * difficultyKeys.length + startColumn);
  if (selectSkip) {
    WAVE_CHOICES.forEach((choice, index) => {
      const wave = game.wave + 1 + choice.skip;
      const button = skipButtons[index];
      button.firstElementChild.textContent = `WAVE ${wave}`;
      button.setAttribute('aria-label', choiceLabel(wave, choice));
    });
    chooseSkip(0);
  }
  const title = byId('screen-title');
  title.hidden = phase === 'ready' || phase === 'playing';
  byId('screen-summary').hidden = title.hidden;
  byId('screen-title-text').textContent = status[phase];
  const messages = {
    clear: `ウェーブ ${game.wave} 達成　／　SCORE ${scoreText(game.score)}`,
    over: `${endReason === 'full' ? '全てのマスが埋まりました' : `タイルを${game.dropLimit}枚落としました`}　／　SCORE ${scoreText(game.score)}`,
    error: '3D描画を開始できませんでした。WebGL 2を利用できるブラウザで開いてください。'
  };
  const message = byId('screen-message');
  message.hidden = !messages[phase];
  message.textContent = messages[phase] ?? '';
  const bonus = byId('wave-bonus');
  bonus.hidden = phase !== 'clear' || !game.waveBonus;
  bonus.textContent = game.waveBonus ? `+${bonusText(game.waveBonus)}` : '';
  byId('play-label').textContent = { ready: 'START WAVE', paused: 'RESUME', clear: 'NEXT WAVE', over: 'PLAY AGAIN' }[phase] ?? '';
  play.hidden = phase === 'error';
  byId('screen-actions').hidden = phase === 'error';
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

function showWaveGoal() {
  const { goal, target, sprint } = game.waveData;
  const count = target.toLocaleString('ja-JP');
  const text = {
    match: `FLOWを${count}回`,
    horizontal: `横のFLOWを${count}回`,
    diagonal: `斜めのFLOWを${count}回`,
    tiles: `タイルを${count}枚さばく`,
    points: `${count}点を獲得`,
    chain: `2連鎖以上を${count}回`
  }[goal];
  const wave = `WAVE ${String(game.wave).padStart(2, '0')}`;
  byId('wave-goal-number').textContent = sprint ? `${wave} / SPRINT` : wave;
  byId('wave-goal-text').textContent = text;
  const banner = byId('wave-goal');
  banner.classList.remove('show');
  void banner.offsetWidth;
  banner.classList.add('show');
  byId('status-live').textContent = `ウェーブ ${game.wave}、ノルマは${text}`;
}

function updateSound() {
  sound.setAttribute('aria-pressed', audio.enabled);
  sound.querySelector('use').setAttribute('href', audio.enabled ? '#i-sound' : '#i-mute');
}

function updateVolume() {
  volume.value = Math.round(audio.volume * 100);
  volume.setAttribute('aria-valuetext', `${volume.value}%`);
}

function toggleSound() {
  audio.setEnabled(!audio.enabled);
  saveStorage('sound', audio.enabled ? 'on' : 'off');
  updateSound();
}

function releaseInputs() {
  moveKeys.clear();
  touchDirections.clear();
  queuedMoves.length = 0;
  fastKeys.clear();
  gestures.clear();
  movement = null;
  moveIn = 0;
  repeatIn = 0;
  fastPointer = null;
  dragPointer = null;
  padDirection = null;
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

function setResultInputLocked(locked) {
  resultInputLocked = locked;
  play.disabled = locked;
  for (const control of resultControls) control.inert = locked;
}

async function waitForResultAnimations() {
  for (;;) {
    const running = screen.getAnimations({ subtree: true }).filter(animation => animation.pending || animation.playState === 'running');
    if (!running.length) break;
    await Promise.allSettled(running.map(animation => animation.finished));
  }
  resultAnimationsDone = true;
}

function onGameEvent(type, data) {
  if (type === 'tumble') {
    audio.event(type, data);
    return;
  }
  scene.event(type, data, game);
  if (game.score > bestScores[game.difficultyKey]) {
    bestScores[game.difficultyKey] = game.score;
    saveStorage(`best.${game.difficultyKey}`, game.score);
  }
  if (type === 'match') {
    let label = 'FLOW';
    if (data.chain > 1) label = `${data.chain}× CHAIN`;
    else if (data.lines > 1) label = `${data.lines}× FLOW`;
    else if (data.longest > 3) label = `${data.longest} TILE FLOW`;
    announce(`${label} +${data.total}${data.recoveredDrop ? '  /  DROP +1' : ''}`);
    byId('status-live').textContent = `${label}、${data.total}点${data.recoveredDrop ? '、DROPを1回復' : ''}`;
  }
  if (type === 'miss') {
    announce('TILE MISSED');
    byId('status-live').textContent = `タイルを落としました。残り${game.dropsRemaining}枚。`;
  }
  if (type === 'blocked') announce('FULL');
  if (type === 'start') {
    byId('announce').classList.remove('show');
    if (data.newRun || data.refillDrops) showTrack(audio.nextTrack().title);
    showWaveGoal();
  }
  if (type === 'over') {
    endReason = data.reason;
    byId('status-live').textContent = `ゲーム終了。スコア ${game.score}`;
  }
  if (type === 'clear') {
    byId('status-live').textContent = `ウェーブ ${game.wave} 達成${game.waveBonus ? `、ボーナス ${game.waveBonus}点` : ''}`;
  }
  if (['start', 'playing', 'paused', 'over', 'clear'].includes(type)) {
    releaseInputs();
    updateScreen();
    audio.setRunning(game.phase === 'playing' || game.phase === 'clear', game.wave);
    if (type === 'clear' || type === 'over') {
      resultAnimationsDone = false;
      setResultInputLocked(true);
      void waitForResultAnimations();
      stage.focus({ preventScroll: true });
    } else if (game.phase === 'playing') stage.focus({ preventScroll: true });
    else if (!guide.open && !document.hidden) play.focus({ preventScroll: true });
  }
  audio.event(type, data);
  if (type !== 'move' && type !== 'blocked' && type !== 'spawn') updateHUD();
}

function activate() {
  if (!scene || resultInputLocked || game.phase === 'playing') return;
  void audio.unlock();
  if (game.phase === 'paused') game.pause();
  else game.begin(difficultyKeys[startColumn], game.phase === 'clear' ? skipChoice : startRow);
}

function runAction(action) {
  if (guide.open) return;
  if (action === 'left') game.move(-1);
  if (action === 'right') game.move(1);
  if (action === 'place') game.place();
  if (action === 'throw') game.throwBack();
}

function syncMovement() {
  const next = keys[[...moveKeys].at(-1)] ?? padDirection ?? [...touchDirections.values()].at(-1) ?? null;
  if (next === movement) return;
  movement = next;
  repeatIn = movement ? MOVE_REPEAT_DELAY : 0;
}

function queueMove(direction) {
  destination = null;
  if (queuedMoves.length < LANES - 1) queuedMoves.push(direction);
  moveHeld();
}

function setTouchDirection(pointerId, direction) {
  if ((touchDirections.get(pointerId) ?? null) === direction) return;
  touchDirections.delete(pointerId);
  if (direction) touchDirections.set(pointerId, direction);
  syncMovement();
  if (direction) queueMove(direction);
}

function updateGamepad() {
  const previous = previousPad;
  const pad = readGamepad(previous?.stick);
  previousPad = pad;
  if (resultInputLocked || !document.hasFocus()) return false;
  const confirm = pad?.confirm && !previous?.confirm;
  const pausePressed = pad?.pause && !previous?.pause;
  const direction = pad?.direction ?? null;
  const directionPressed = direction && direction !== previous?.direction;

  if (guide.open) {
    if (confirm || pausePressed || (pad?.cancel && !previous?.cancel)) guide.close();
    return false;
  }
  if (game.phase !== 'playing') {
    const vertical = pad?.menuVertical ?? 0;
    const verticalPressed = vertical !== (previous?.menuVertical ?? 0) ? vertical : 0;
    if (directionPressed || verticalPressed) moveSelection(directionPressed ? (direction === 'left' ? -1 : 1) : 0, verticalPressed);
    if (confirm || pausePressed) activate();
    return false;
  }
  if (pausePressed) {
    game.pause();
    return false;
  }
  if (direction !== padDirection) {
    padDirection = direction;
    syncMovement();
    if (directionPressed) queueMove(direction);
  }
  if (confirm) runAction('place');
  if (pad?.throw && !previous?.throw) runAction('throw');
  return pad?.fast === true;
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
  if (destination === game.lane) destination = null;
  if (destination !== null) movePaddle(destination < game.lane ? 'left' : 'right');
}

function showGuide() {
  if (game.phase === 'playing') game.pause();
  guide.showModal();
}

play.addEventListener('click', activate);
buildSelection();
volume.addEventListener('input', () => {
  audio.setVolume(volume.valueAsNumber / 100);
  updateVolume();
  saveStorage('volume', volume.value);
});
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

// Some browsers require a page gesture to start audio after a gamepad-only start.
for (const type of ['pointerup', 'keydown']) {
  window.addEventListener(type, event => {
    if (!event.isTrusted || resultInputLocked || !audio.enabled || !audio.running) return;
    if (audio.player.paused || audio.ctx?.state === 'suspended') {
      void audio.unlock();
      audio.syncPlayback();
    }
  });
}

window.addEventListener('keydown', event => {
  if (guide.open || event.ctrlKey || event.metaKey || event.altKey) return;
  if (resultInputLocked) ignoredResultKeys.add(event.code);
  else if (!event.repeat) ignoredResultKeys.delete(event.code);
  if (ignoredResultKeys.has(event.code)) {
    event.preventDefault();
    return;
  }
  const onButton = event.target instanceof HTMLButtonElement;
  const onVolume = event.target === volume;
  if (event.code === 'Enter' && event.repeat && game.phase !== 'playing') {
    event.preventDefault();
    return;
  }
  const direction = menuDirections[event.code];
  if (direction && !onVolume && moveSelection(...direction)) {
    event.preventDefault();
    const grid = startGrid.hidden ? skipGrid : startGrid;
    grid.querySelector('[aria-checked="true"]').focus({ preventScroll: true });
    return;
  }
  if (event.code === 'Enter' && game.phase !== 'playing' && (!onButton || waveSelection.contains(event.target)) && !onVolume && !event.repeat) {
    event.preventDefault();
    void activate();
  }
  if ((event.code === 'Escape' || event.code === 'KeyP') && !event.repeat && game.phase !== 'ready') {
    event.preventDefault();
    game.pause();
  }
  if (event.code === 'KeyM' && !event.repeat) toggleSound();
  const action = keys[event.code];
  if (!action || game.phase !== 'playing' || onVolume || (event.code === 'Space' && onButton)) return;
  event.preventDefault();
  if (action === 'left' || action === 'right') {
    if (!event.repeat && !moveKeys.has(event.code)) {
      moveKeys.add(event.code);
      syncMovement();
      queueMove(action);
    }
  } else if (action === 'fast') {
    if (!event.repeat) fastKeys.add(event.code);
  } else if (!event.repeat || action === 'place') {
    runAction(action);
  }
});
window.addEventListener('keyup', event => {
  ignoredResultKeys.delete(event.code);
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
      if (!direction) runAction(action);
      else if (event.detail === 0) queueMove(action);
      stage.focus({ preventScroll: true });
    });
    if (!direction) continue;
  }
  button.addEventListener('pointerdown', event => {
    if (game.phase !== 'playing' || event.button !== 0) return;
    button.setPointerCapture(event.pointerId);
    if (direction) setTouchDirection(event.pointerId, action);
    else fastPointer = event.pointerId;
    stage.focus({ preventScroll: true });
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    button.addEventListener(type, event => {
      if (fastPointer === event.pointerId) fastPointer = null;
      if (direction) setTouchDirection(event.pointerId, null);
      if (type === 'pointerup' && game.phase === 'playing') stage.focus({ preventScroll: true });
    });
  }
}

viewport.addEventListener('pointerdown', event => {
  if (game.phase !== 'playing' || event.button !== 0) return;
  const { clientX: x, clientY: y } = event;
  gestures.set(event.pointerId, {
    x, y, action: scene.pointerAction(x, y), started: performance.now(), moved: false
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
  if (dragPointer === null && Math.abs(dx) > Math.max(DRAG_SLOP, Math.abs(dy))) dragPointer = event.pointerId;
  if (dragPointer !== event.pointerId) return;
  const direction = dx < -DRAG_SLOP ? 'left' : dx > DRAG_SLOP ? 'right' : null;
  setTouchDirection(event.pointerId, direction);
});
for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  viewport.addEventListener(type, event => {
    const pointer = gestures.get(event.pointerId);
    gestures.delete(event.pointerId);
    if (dragPointer === event.pointerId) {
      dragPointer = null;
      setTouchDirection(event.pointerId, null);
    }
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
  const padFast = updateGamepad();
  moveHeld();
  moveIn = Math.max(0, moveIn);
  const fast = padFast || fastPointer !== null || fastKeys.size > 0 || [...gestures.values()].some(pointer =>
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
  const rippleActive = game.phase === 'clear' && !scene.reduced.matches && scene.ripple;
  if (resultInputLocked && resultAnimationsDone && !rippleActive) {
    setResultInputLocked(false);
    if (!guide.open && !document.hidden) play.focus({ preventScroll: true });
  }
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
updateVolume();
updateSound();
updateScreen();
