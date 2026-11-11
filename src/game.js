export const LANES = 5;
export const ROWS = 5;
export const BELT_CELLS = 20;
export const BELT_STEP = 11.6 / 12;
export const BELT_LENGTH = BELT_CELLS * BELT_STEP;
export const MAX_DROPS = 3;
const FAST_MULTIPLIER = 3;
const PLACE_TIME = .16;
const HIGHLIGHT_TIME = .40;
const SETTLE_TIME = .60;
const EXTRA_TILE_HIGHLIGHT = .06;
const OPENING_LANES = [1, 3];
const TILE_SPACING_MULTIPLIER = 2;
const beltCell = distance => Math.floor((BELT_LENGTH - distance) / BELT_STEP + 1e-8);

export const DIFFICULTIES = {
  easy: { speed: .8, spawnDelay: .45, colors: 2 },
  normal: { speed: 1, spawnDelay: 0, colors: 3 },
  hard: { speed: 1.22, spawnDelay: -.34, colors: 4 }
};

export const TILES = [
  { color: '#30e8ff', name: 'シアン', symbol: '○' },
  { color: '#fa65d9', name: 'ピンク', symbol: '◇' },
  { color: '#ffbd51', name: 'アンバー', symbol: '＋' },
  { color: '#8d81ff', name: 'パープル', symbol: '△' },
  { color: '#8af579', name: 'ライム', symbol: '＝' },
  { color: '#ff705e', name: 'コーラル', symbol: '×' }
];

const WAVE_TYPES = [
  { title: 'FIRST LIGHT', goal: 'match', label: 'FLOW', target: 3 },
  { title: 'AFTERGLOW', goal: 'match', label: 'FLOW', target: 5 },
  { title: 'REFRACTION', goal: 'diagonal', label: '斜め', target: 3 },
  { title: 'TIDAL FLOW', goal: 'tiles', label: 'タイル', target: 30 },
  { title: 'HORIZON', goal: 'horizontal', label: '横', target: 4 },
  { title: 'RADIANCE', goal: 'points', label: '得点', target: 2600 }
];

export function waveInfo(number) {
  const cycle = Math.floor((number - 1) / WAVE_TYPES.length);
  const wave = WAVE_TYPES[(number - 1) % WAVE_TYPES.length];
  const increase = wave.goal === 'points' ? 700 : wave.goal === 'tiles' ? 5 : 1;
  return { ...wave, target: wave.target + increase * cycle };
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
      const color = board[lane][row].color;
      for (const { dx, dy, kind, points } of directions) {
        if (board[lane - dx]?.[row - dy]?.color === color) continue;
        const cells = [];
        let x = lane;
        let y = row;
        while (board[x]?.[y]?.color === color) {
          cells.push({ lane: x, row: y, tile: board[x][y] });
          x += dx;
          y += dy;
        }
        if (cells.length >= 3) matches.push({ cells, kind, points });
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
    this.nextId = 0;
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

  begin(difficulty = 'normal') {
    const newRun = this.phase !== 'clear';
    const refillDrops = !newRun && this.wave % 5 === 0;
    if (!newRun) {
      this.wave++;
      if (refillDrops) this.drops = 0;
    } else {
      this.difficulty = Object.hasOwn(DIFFICULTIES, difficulty) ? DIFFICULTIES[difficulty] : DIFFICULTIES.normal;
      this.wave = 1;
      this.score = 0;
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
      const colors = Math.min(TILES.length, this.difficulty.colors + Math.floor((this.wave - 1) / 2));
      this.bag = Array.from({ length: colors * 3 }, (_, i) => i % colors);
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
    this.resolution = { remaining: HIGHLIGHT_TIME, chain, stopsBelt: true, clear: result };
    this.onEvent('highlight', { cells: [...result.unique.values()], chain, duration: HIGHLIGHT_TIME });
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
        top.tile.color === cell.tile.color;
    });
    if (!vertical) return;
    // Keep the current clear intact so other new lines can become the next chain.
    const matches = previous.matches.map(match => match === vertical ? {
      ...match, cells: [...match.cells, cell]
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
    this.resolution = { remaining: SETTLE_TIME, chain: chain + 1, stopsBelt: true };
    const longest = Math.max(...matches.map(match => match.cells.length));
    this.onEvent('match', {
      cells: [...unique.values()], shifts, total, chain, lines: matches.length, longest, duration: SETTLE_TIME
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
      if (this.drops >= MAX_DROPS) this.end('drops');
    }
    tile.arrived = true;
  }

  end(reason) {
    this.phase = 'over';
    this.onEvent('over', { reason });
  }

  beltSpeed() {
    return Math.min(3.75, 1.38 + (this.wave - 1) * .13 + this.elapsed * .004) * this.difficulty.speed;
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
      this.score += this.wave * 250 + 50 * (MAX_DROPS - this.drops);
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
