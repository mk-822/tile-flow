export const LANES = 5;
export const ROWS = 5;
export const BELT_CELLS = 20;
export const BELT_STEP = 11.6 / 12;
export const BELT_LENGTH = BELT_CELLS * BELT_STEP;
export const WAVE_CHOICES = [
  { skip: 0, drops: 3, bonus: 0 },
  { skip: 5, drops: 4, bonus: 100000 },
  { skip: 10, drops: 5, bonus: 200000 }
];
const FAST_MULTIPLIER = 3;
const MAX_BELT_SPEED = 3.75;
const MAX_START_SPEED = 3.5;
const SPEED_GAIN_PER_SECOND = .001;
const SPRINT_SPEED_MULTIPLIER = 1.5;
const PLACE_TIME = .16;
const SETTLE_TIME = .60;
const EXTRA_TILE_HIGHLIGHT = .06;
const OPENING_LANES = [1, 3];
const TILE_SPACING_MULTIPLIER = 2;
const beltCell = distance => Math.floor((BELT_LENGTH - distance) / BELT_STEP + 1e-8);

export const DIFFICULTIES = {
  easy: { label: '初級', speed: .8, spawnDelay: .45, colors: 2, highlightTime: .8 },
  normal: { label: '中級', speed: 1, spawnDelay: 0, colors: 3, highlightTime: .6 },
  hard: { label: '上級', speed: 1.22, spawnDelay: -.34, colors: 4, highlightTime: .4 }
};

export const TILES = [
  { color: '#30e8ff', name: 'シアン', symbol: '○' },
  { color: '#fa65d9', name: 'ピンク', symbol: '◇' },
  { color: '#ffbd51', name: 'アンバー', symbol: '＋' },
  { color: '#8d81ff', name: 'パープル', symbol: '△' },
  { color: '#8af579', name: 'ライム', symbol: '＝' },
  { color: '#ff705e', name: 'コーラル', symbol: '×' },
  { color: '#16b578', name: 'エメラルド', symbol: '⬟' },
  { color: '#4078ff', name: 'ブルー', symbol: '≋' },
  { color: '#fff1fa', name: 'ワイルド', symbol: '★' }
];
export const WILD_TILE = TILES.length - 1;
const BASE_COLOR_COUNT = 6;

const WAVE_TYPES = [
  { title: 'FIRST LIGHT', goal: 'match', label: 'FLOW', target: 3 },
  { title: 'AFTERGLOW', goal: 'match', label: 'FLOW', target: 5 },
  { title: 'REFRACTION', goal: 'diagonal', label: '斜め', target: 3 },
  { title: 'TIDAL FLOW', goal: 'tiles', label: 'タイル', target: 30 },
  { title: 'HORIZON', goal: 'horizontal', label: '横', target: 4 },
  { title: 'RADIANCE', goal: 'points', label: '得点', target: 2600 }
];

export function waveInfo(number) {
  if (number >= 30 && number % 10 === 0) {
    return { title: 'SPRINT WAVE', goal: 'tiles', label: 'タイル', target: 24, sprint: true };
  }
  if (number === 20 || (number >= 25 && number % 10 === 5)) {
    const target = Math.min(5, 2 + Math.floor((number - 20) / 30));
    return { title: 'CHAIN WAVE', goal: 'chain', label: 'CHAIN', target };
  }
  const cycle = Math.floor((number - 1) / WAVE_TYPES.length);
  const wave = WAVE_TYPES[(number - 1) % WAVE_TYPES.length];
  const increase = wave.goal === 'points' ? 700 : wave.goal === 'tiles' ? 5 : 1;
  return { ...wave, target: wave.target + increase * cycle };
}

function matchesColor(tile, color) {
  return tile && (tile.color === color || tile.color === WILD_TILE);
}

export function findMatches(board) {
  const matches = [];
  const directions = [
    { dx: 0, dy: 1, kind: 'vertical', points: 100 },
    { dx: 1, dy: 0, kind: 'horizontal', points: 250 },
    { dx: 1, dy: 1, kind: 'diagonal', points: 500 },
    { dx: 1, dy: -1, kind: 'diagonal', points: 500 }
  ];
  for (let lane = 0; lane < LANES; lane++) {
    for (let row = 0; row < board[lane].length; row++) {
      for (const { dx, dy, kind, points } of directions) {
        let color = board[lane][row].color;
        if (color === WILD_TILE) {
          // Use the first colored tile after the leading wilds as the line's color.
          let x = lane + dx;
          let y = row + dy;
          while (board[x]?.[y]?.color === WILD_TILE) {
            x += dx;
            y += dy;
          }
          color = board[x]?.[y]?.color ?? WILD_TILE;
        }
        const previous = board[lane - dx]?.[row - dy];
        if (matchesColor(previous, color) || (color === WILD_TILE && previous)) continue;
        const cells = [];
        let x = lane;
        let y = row;
        while (matchesColor(board[x]?.[y], color)) {
          cells.push({ lane: x, row: y, tile: board[x][y] });
          x += dx;
          y += dy;
        }
        if (cells.length >= 3) matches.push({ cells, kind, points, color });
      }
    }
  }
  return matches;
}

export class Game {
  constructor(onEvent, random = Math.random) {
    this.onEvent = onEvent;
    this.random = random;
    this.phase = 'ready';
    this.wave = 1;
    this.score = 0;
    this.drops = 0;
    this.dropLimit = WAVE_CHOICES[0].drops;
    this.waveBonus = 0;
    this.nextId = 0;
    this.difficultyKey = 'normal';
    this.difficulty = DIFFICULTIES.normal;
    this.setupWave();
  }

  setupWave() {
    this.lane = 2;
    this.waveData = waveInfo(this.wave);
    this.progress = 0;
    this.elapsed = 0;
    this.openingIndex = 0;
    this.spawnIn = this.spawnInterval() * .45;
    this.stack = [];
    this.board = Array.from({ length: LANES }, () => []);
    this.bag = [];
    this.openingColor = this.wave === 1 ? 0 : 1;
    this.belt = [this.tile(this.openingColor, this.lane, BELT_LENGTH - 2 * BELT_STEP * TILE_SPACING_MULTIPLIER)];
    this.resolution = null;
    this.pendingActions = [];
  }

  tile(color, lane, distance) {
    return { id: ++this.nextId, color, lane, distance, flight: 0 };
  }

  get canSkipWaves() {
    return this.phase === 'clear' && this.wave % 5 === 0;
  }

  get dropsRemaining() {
    return this.dropLimit - this.drops;
  }

  begin(difficulty = 'normal', choiceIndex = 0) {
    if (this.phase !== 'ready' && this.phase !== 'over' && this.phase !== 'clear') return;
    const newRun = this.phase !== 'clear';
    const refillDrops = this.canSkipWaves;
    const choice = newRun || refillDrops ? WAVE_CHOICES[choiceIndex] ?? WAVE_CHOICES[0] : null;
    if (newRun) {
      this.difficultyKey = Object.hasOwn(DIFFICULTIES, difficulty) ? difficulty : 'normal';
      this.difficulty = DIFFICULTIES[this.difficultyKey];
      this.score = 0;
    }
    this.wave = (newRun ? 1 : this.wave + 1) + (choice?.skip ?? 0);
    this.waveBonus = choice?.bonus ?? 0;
    if (choice) {
      this.dropLimit = choice.drops;
      this.drops = 0;
    }
    this.setupWave();
    this.phase = 'playing';
    this.onEvent('start', { newRun, refillDrops });
  }

  pause() {
    if (this.phase !== 'playing' && this.phase !== 'paused') return;
    this.phase = this.phase === 'playing' ? 'paused' : 'playing';
    this.onEvent(this.phase);
  }

  move(direction) {
    this.selectLane(this.lane + direction);
  }

  selectLane(lane) {
    if (this.phase !== 'playing') return;
    const next = Math.max(0, Math.min(LANES - 1, lane));
    if (next === this.lane) return;
    this.lane = next;
    this.onEvent('move', { lane: next });
  }

  place() {
    this.requestAction('place');
  }

  throwBack() {
    this.requestAction('throw');
  }

  requestAction(action) {
    if (this.phase !== 'playing' || this.stack.length <= this.pendingActions.length) return;
    const lane = this.lane;
    if (this.resolution && (action === 'place' || this.pendingActions.length)) {
      this.pendingActions.push({ action, lane });
      this.applyPendingActions();
    } else {
      this.applyAction(action, lane);
    }
  }

  applyPendingActions() {
    while (this.pendingActions.length) {
      const { action, lane } = this.pendingActions[0];
      if (this.resolution) {
        if (action !== 'place' || !this.conveyorPaused) return;
        if (this.board[lane].length === ROWS && this.resolution.clear?.matches.some(match =>
          match.cells.some(cell => cell.lane === lane)
        )) return;
      }
      this.pendingActions.shift();
      this.applyAction(action, lane);
    }
  }

  applyAction(action, lane) {
    if (action === 'throw') {
      this.returnTile(lane);
      return;
    }
    const column = this.board[lane];
    if (column.length >= ROWS) {
      this.onEvent('blocked', { lane });
      return;
    }
    const from = this.stack.length - 1;
    const tile = this.stack.pop();
    const row = column.length;
    column.push(tile);
    if (this.resolution) {
      const landingTime = PLACE_TIME + (this.resolution.clear ? EXTRA_TILE_HIGHLIGHT : 0);
      this.resolution.remaining = Math.max(this.resolution.remaining, landingTime);
    } else {
      this.resolution = { remaining: PLACE_TIME, chain: 1 };
    }
    this.onEvent('place', { tile, from, lane, row, duration: PLACE_TIME });
    if (this.resolution.clear) this.extendClear({ tile, lane, row });
  }

  returnTile(lane) {
    const halfway = Math.floor(BELT_CELLS / 2);
    const gaps = Array.from({ length: 6 }, (_, offset) => (halfway + offset) * BELT_STEP);
    const throwTime = .44;
    const travel = this.beltSpeed() * throwTime * FAST_MULTIPLIER;
    const distance = gaps.find(slot => this.belt.every(tile => {
      return tile.lane !== lane || tile.distance <= slot - BELT_STEP || tile.distance >= slot + travel + BELT_STEP;
    }));
    if (distance === undefined) {
      this.onEvent('blocked', { lane });
      return;
    }
    const from = this.stack.length - 1;
    const tile = this.stack.pop();
    Object.assign(tile, { lane, distance, flight: throwTime });
    this.belt.push(tile);
    this.onEvent('throw', { tile, from, duration: throwTime });
  }

  drawColor() {
    if (!this.bag.length) {
      const colors = Math.min(BASE_COLOR_COUNT, this.difficulty.colors + Math.floor((this.wave - 1) / 2))
        + Number(this.wave >= 60) + Number(this.wave >= 90);
      this.bag = Array.from({ length: colors * 3 }, (_, i) => i % colors);
      if (this.wave >= 6) this.bag.push(WILD_TILE);
      for (let i = this.bag.length - 1; i > 0; i--) {
        const j = Math.floor(this.random() * (i + 1));
        [this.bag[i], this.bag[j]] = [this.bag[j], this.bag[i]];
      }
    }
    return this.bag.pop();
  }

  spawn(preferredLane, color) {
    const openLanes = Array.from({ length: LANES }, (_, i) => i).filter(lane =>
      this.belt.every(tile => tile.lane !== lane || tile.distance <= BELT_LENGTH - BELT_STEP)
    );
    if (!openLanes.length) return false;
    const lane = openLanes.includes(preferredLane) ? preferredLane : openLanes[Math.floor(this.random() * openLanes.length)];
    const tile = this.tile(color ?? this.drawColor(), lane, BELT_LENGTH);
    this.belt.push(tile);
    this.onEvent('spawn', { tile });
    return true;
  }

  spawnInterval() {
    return Math.max(.71, 2.1 - this.wave * .095 + this.difficulty.spawnDelay) * TILE_SPACING_MULTIPLIER;
  }

  feedBelt() {
    const lane = OPENING_LANES[this.openingIndex];
    if (!this.spawn(lane, lane === undefined ? undefined : this.openingColor)) {
      this.spawnIn = .1;
      return;
    }
    if (lane !== undefined) this.openingIndex++;
    this.spawnIn += this.spawnInterval();
  }

  resolve() {
    const { chain, clear } = this.resolution;
    if (clear) {
      this.clearMatches(clear, chain);
      return;
    }
    const matches = findMatches(this.board);
    if (!matches.length) {
      this.resolution = null;
      if (this.board.every(column => column.length === ROWS)) this.end('full');
      return;
    }
    const result = this.summarizeMatches(matches, chain);
    this.score += result.total;
    this.progress += result.progress;
    const duration = this.difficulty.highlightTime;
    this.resolution = { remaining: duration, chain, stopsBelt: true, clear: result };
    this.onEvent('highlight', { cells: [...result.unique.values()], chain, duration });
  }

  summarizeMatches(matches, chain) {
    const unique = new Map();
    const goal = this.waveData.goal;
    let total = 0;
    let progress = 0;
    for (const match of matches) {
      for (const cell of match.cells) unique.set(cell.tile.id, cell);
      const count = match.cells.length - 2;
      total += match.points * count * count * chain;
      if (goal === 'match' || goal === match.kind) progress += count;
    }
    if (goal === 'points') progress = total;
    return { matches, unique, total, progress };
  }

  extendClear(cell) {
    const { chain, clear: previous } = this.resolution;
    const vertical = previous.matches.find(match => {
      const top = match.cells.at(-1);
      return match.kind === 'vertical' && top.lane === cell.lane && top.row === cell.row - 1 &&
        (match.color === WILD_TILE || matchesColor(cell.tile, match.color));
    });
    if (!vertical) return;
    // Keep the current clear intact so other new lines can become the next chain.
    const matches = previous.matches.map(match => match === vertical ? {
      ...match, color: match.color === WILD_TILE ? cell.tile.color : match.color, cells: [...match.cells, cell]
    } : match);
    const clear = this.summarizeMatches(matches, chain);
    this.score += clear.total - previous.total;
    this.progress += clear.progress - previous.progress;
    this.resolution.clear = clear;
    this.onEvent('extend', { cells: [cell] });
  }

  clearMatches({ matches, unique, total }, chain) {
    const shifts = [];
    this.board = this.board.map((column, lane) => column.filter((tile, row) => {
      if (unique.has(tile.id)) return false;
      const newRow = row - column.slice(0, row).filter(lower => unique.has(lower.id)).length;
      if (newRow !== row) shifts.push({ tile, lane, from: row, row: newRow });
      return true;
    }));
    if (this.waveData.goal === 'chain' && chain === 2) this.progress++;
    const recoveredDrop = chain >= 4 && this.drops > 0;
    if (recoveredDrop) this.drops--;
    this.resolution = { remaining: SETTLE_TIME, chain: chain + 1, stopsBelt: true };
    const longest = Math.max(...matches.map(match => match.cells.length));
    this.onEvent('match', {
      cells: [...unique.values()], shifts, total, chain, lines: matches.length, longest, recoveredDrop, duration: SETTLE_TIME
    });
  }

  arrive(tile) {
    if (!tile.arrived && this.waveData.goal === 'tiles') this.progress++;
    if (tile.lane === this.lane && this.stack.length < ROWS) {
      this.stack.push(tile);
      if (!tile.arrived) {
        this.score += 5;
        if (this.waveData.goal === 'points') this.progress += 5;
      }
      this.onEvent('catch', { tile, slot: this.stack.length - 1 });
    } else {
      this.drops++;
      this.onEvent('miss', { tile });
      if (this.dropsRemaining <= 0) this.end('drops');
    }
    tile.arrived = true;
  }

  end(reason) {
    this.phase = 'over';
    this.onEvent('over', { reason });
  }

  beltSpeed() {
    if (this.waveData.sprint) return MAX_BELT_SPEED * SPRINT_SPEED_MULTIPLIER * this.difficulty.speed;
    const startSpeed = 1.38 + (MAX_START_SPEED - 1.38) * Math.min(1, (this.wave - 1) / 19);
    return Math.min(MAX_BELT_SPEED, startSpeed + this.elapsed * SPEED_GAIN_PER_SECOND) * this.difficulty.speed;
  }

  get conveyorPaused() {
    return this.resolution?.stopsBelt === true;
  }

  step(dt, fast = false) {
    if (this.phase !== 'playing') return;
    const wasStopped = this.conveyorPaused;
    if (this.resolution) {
      this.resolution.remaining -= dt;
      if (this.resolution.remaining <= 0) this.resolve();
    }
    if (this.phase !== 'playing') return;
    if (!this.resolution && this.progress >= this.waveData.target) {
      this.phase = 'clear';
      this.score += this.wave * 250 + 50 * this.dropsRemaining + this.waveBonus;
      this.onEvent('clear');
      return;
    }
    this.applyPendingActions();
    const stopped = wasStopped || this.conveyorPaused;
    if (!stopped) this.elapsed += dt;
    const beltTime = stopped ? 0 : dt * (fast ? FAST_MULTIPLIER : 1);
    const travel = this.beltSpeed() * beltTime;
    const arrivals = [];
    let nearest;
    let nearestDistance = Infinity;
    this.belt = this.belt.filter(tile => {
      if (tile.flight > 0) {
        tile.flight = Math.max(0, tile.flight - dt);
        return true;
      }
      if (travel > 0 && tile.distance < nearestDistance) {
        nearest = tile;
        nearestDistance = tile.distance;
      }
      tile.distance -= travel;
      if (tile.distance > 0) return true;
      arrivals.push(tile);
      return false;
    });
    if (nearest?.distance > 0 && beltCell(nearest.distance) !== beltCell(nearestDistance)) {
      this.onEvent('tumble', { tile: nearest });
    }
    for (const tile of arrivals.sort((a, b) => a.distance - b.distance)) {
      this.arrive(tile);
      if (this.phase !== 'playing') return;
    }
    if (stopped) return;
    this.spawnIn -= beltTime;
    if (this.spawnIn <= 0) this.feedBelt();
  }
}
