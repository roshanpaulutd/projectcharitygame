(() => {
  'use strict';

  const GOAL = 8;
  const START_TIME = 75;
  const START_TRAIL = 4;
  const MIN_TRAIL = 2;
  const CELL_SIZE = 28;
  const ENEMY_MOVE_EVERY = 4;
  const MILESTONES = new Map([
    [2, '25% — Keep the clean water flowing!'],
    [4, '50% — Halfway there!'],
    [6, '75% — Almost there!'],
    [8, '100% — Clean Water Goal Reached!']
  ]);
  const DIRECTIONS = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 }
  };
  const icons = {
    clean: '<svg viewBox="0 0 40 48"><path d="M20 3C15.5 10.4 7 20.3 7 29a13 13 0 0 0 26 0C33 20.3 24.5 10.4 20 3Z"/></svg>',
    contaminated: '<svg viewBox="0 0 40 48"><path class="pollution-body" d="M20 3C15.5 10.4 7 20.3 7 29a13 13 0 0 0 26 0C33 20.3 24.5 10.4 20 3Z"/><path class="pollution-mark" d="M20 17v12m0 5v.2"/></svg>'
  };

  const elements = {
    score: document.querySelector('#score-value'),
    time: document.querySelector('#time-value'),
    timeCard: document.querySelector('.time-card'),
    progress: document.querySelector('#progress-value'),
    progressTrack: document.querySelector('#progress-track'),
    progressFill: document.querySelector('#progress-fill'),
    progressDetail: document.querySelector('#progress-detail'),
    lives: document.querySelector('#life-row'),
    grid: document.querySelector('#snake-grid'),
    trail: document.querySelector('#trail-layer'),
    player: document.querySelector('#player'),
    items: document.querySelector('#items-layer'),
    effects: document.querySelector('#effects-layer'),
    stage: document.querySelector('#game-stage'),
    overlay: document.querySelector('#game-overlay'),
    overlayKicker: document.querySelector('#overlay-kicker'),
    overlayTitle: document.querySelector('#overlay-title'),
    overlayTagline: document.querySelector('#overlay-tagline'),
    overlayMessage: document.querySelector('#overlay-message'),
    overlayButton: document.querySelector('#overlay-button'),
    overlayButtonText: document.querySelector('#overlay-button-text'),
    overlayFootnote: document.querySelector('#overlay-footnote'),
    toast: document.querySelector('#toast'),
    flash: document.querySelector('#screen-flash')
  };

  const state = {
    phase: 'ready',
    score: 0,
    delivered: 0,
    lives: 3,
    time: START_TIME,
    cols: 0,
    rows: 0,
    snake: [],
    direction: DIRECTIONS.right,
    nextDirection: DIRECTIONS.right,
    cleanDrop: null,
    enemies: [],
    enemyTarget: 2,
    tickCount: 0,
    longestTrail: START_TRAIL,
    lossReason: null,
    countdownTimer: null,
    gameLoop: null,
    toastTimer: null,
    scoreTimer: null,
    celebrationTimer: null,
    toastMilestone: false,
    nextEntityId: 0
  };

  function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
  }

  function paintHud() {
    const percent = Math.round((state.delivered / GOAL) * 100);
    elements.score.textContent = String(state.score).padStart(4, '0');
    elements.time.textContent = formatTime(state.time);
    elements.timeCard.classList.toggle('is-urgent', state.time <= 15 && state.phase === 'playing');
    elements.progress.textContent = `${percent}%`;
    elements.progressTrack.setAttribute('aria-valuenow', String(percent));
    elements.progressFill.style.width = `${percent}%`;
    elements.progressDetail.textContent = `${state.delivered} of ${GOAL} drops delivered`;
    elements.lives.setAttribute('aria-label', `${state.lives} ${state.lives === 1 ? 'life' : 'lives'} remaining`);
    [...elements.lives.children].forEach((life, index) => life.classList.toggle('is-lost', index >= state.lives));
  }

  function setCellPosition(element, cell) {
    element.style.left = `${((cell.x + 0.5) / state.cols) * 100}%`;
    element.style.top = `${((cell.y + 0.5) / state.rows) * 100}%`;
    element.style.width = `${100 / state.cols}%`;
    element.style.height = `${100 / state.rows}%`;
  }

  function cellIsOccupied(x, y, { ignoreSnake = false, ignoreClean = false, ignoreEnemyId = null } = {}) {
    if (!ignoreSnake && state.snake.some((segment) => segment.x === x && segment.y === y)) return true;
    if (!ignoreClean && state.cleanDrop?.x === x && state.cleanDrop?.y === y) return true;
    return state.enemies.some((enemy) => enemy.id !== ignoreEnemyId && enemy.x === x && enemy.y === y);
  }

  function findFreeCell() {
    const freeCells = [];
    for (let y = 0; y < state.rows; y += 1) {
      for (let x = 0; x < state.cols; x += 1) {
        if (!cellIsOccupied(x, y)) freeCells.push({ x, y });
      }
    }
    return freeCells[Math.floor(Math.random() * freeCells.length)] || null;
  }

  function configureGrid() {
    const rect = elements.stage.getBoundingClientRect();
    const width = elements.stage.clientWidth || rect.width || 616;
    const height = elements.stage.clientHeight || rect.height || 328;
    const cols = Math.max(10, Math.min(36, Math.floor(width / CELL_SIZE)));
    const rows = Math.max(10, Math.min(22, Math.floor(height / CELL_SIZE)));
    if (cols === state.cols && rows === state.rows) return;
    const trailLength = state.snake.length || START_TRAIL;
    state.cols = cols;
    state.rows = rows;
    elements.stage.style.setProperty('--cell-width', `${100 / cols}%`);
    elements.stage.style.setProperty('--cell-height', `${100 / rows}%`);
    if (state.phase === 'playing') {
      state.cleanDrop = null;
      state.enemies = [];
      resetTrail(trailLength);
      spawnCleanDrop();
      maintainEnemies();
      renderGame();
    }
  }

  function resetTrail(length = START_TRAIL) {
    const targetLength = Math.max(MIN_TRAIL, Math.min(length, state.cols - 1));
    const candidates = [];
    for (let y = 1; y < state.rows - 1; y += 1) {
      for (let x = targetLength - 1; x < state.cols - 1; x += 1) {
        const trail = Array.from({ length: targetLength }, (_, index) => ({ x: x - index, y }));
        if (trail.every((cell) => !cellIsOccupied(cell.x, cell.y, { ignoreSnake: true }))) {
          candidates.push({ trail, distance: Math.abs(x - state.cols / 2) + Math.abs(y - state.rows / 2) });
        }
      }
    }
    candidates.sort((a, b) => a.distance - b.distance);
    state.snake = candidates[0]?.trail || [{ x: Math.floor(state.cols / 2), y: Math.floor(state.rows / 2) }];
    state.direction = DIRECTIONS.right;
    state.nextDirection = DIRECTIONS.right;
    state.longestTrail = Math.max(state.longestTrail, state.snake.length);
  }

  function renderTrail() {
    while (elements.trail.children.length > state.snake.length) {
      elements.trail.lastElementChild.remove();
    }
    state.snake.forEach((segment, index) => {
      let node = elements.trail.children[index];
      if (!node) {
        node = document.createElement('span');
        node.innerHTML = '<span class="trail-bubble"></span>';
        elements.trail.append(node);
      }
      node.className = `trail-segment${index === state.snake.length - 1 ? ' is-tail' : ''}`;
      setCellPosition(node, segment);
    });
    setCellPosition(elements.player, state.snake[0]);
  }

  function renderItems() {
    const items = [
      ...(state.cleanDrop ? [{ ...state.cleanDrop, kind: 'clean' }] : []),
      ...state.enemies.map((enemy) => ({ ...enemy, kind: 'contaminated' }))
    ];
    while (elements.items.children.length > items.length) elements.items.lastElementChild.remove();
    items.forEach((item, index) => {
      let node = elements.items.children[index];
      const entityKey = `${item.kind}-${item.id}`;
      if (!node) {
        node = document.createElement('span');
        elements.items.append(node);
      }
      if (node.dataset.entityKey !== entityKey) {
        node.className = `game-item ${item.kind}`;
        node.innerHTML = icons[item.kind];
        node.dataset.entityKey = entityKey;
      }
      setCellPosition(node, item);
    });
  }

  function renderGame() {
    renderTrail();
    renderItems();
  }

  function flash(warning = false) {
    elements.flash.classList.remove('is-active');
    elements.flash.classList.toggle('is-warning', warning);
    void elements.flash.offsetWidth;
    elements.flash.classList.add('is-active');
  }

  function showEffect(kind, cell) {
    const effect = document.createElement('span');
    effect.className = `splash-effect ${kind}`;
    setCellPosition(effect, cell);
    elements.effects.append(effect);
    setTimeout(() => effect.remove(), 520);
  }

  function animateScore() {
    elements.score.classList.remove('is-scored');
    void elements.score.offsetWidth;
    elements.score.classList.add('is-scored');
    clearTimeout(state.scoreTimer);
    state.scoreTimer = setTimeout(() => elements.score.classList.remove('is-scored'), 420);
  }

  function announce(message, milestone = false) {
    if (state.toastMilestone && !milestone) return;
    clearTimeout(state.toastTimer);
    elements.toast.textContent = message;
    elements.toast.classList.toggle('is-milestone', milestone);
    elements.toast.classList.add('is-visible');
    state.toastMilestone = milestone;
    state.toastTimer = setTimeout(() => {
      elements.toast.classList.remove('is-visible');
      state.toastMilestone = false;
    }, milestone ? 3000 : 1500);
  }

  function launchCelebration() {
    clearTimeout(state.celebrationTimer);
    elements.effects.replaceChildren();

    const burst = document.createElement('span');
    burst.className = 'victory-ripple';
    burst.style.left = '50%';
    burst.style.top = '50%';
    elements.effects.append(burst);

    const palette = ['#ffcf32', '#5fd0de', '#3f8a68', '#f7a758', '#ef7c62', '#fff7bf'];
    for (let i = 0; i < 28; i += 1) {
      const piece = document.createElement('span');
      const angle = (Math.PI * 2 * i) / 28;
      const distance = 42 + Math.random() * 70;
      const dx = Math.cos(angle) * distance;
      const dy = Math.sin(angle) * distance;
      const rotation = Math.random() * 180;
      piece.className = 'confetti-piece';
      piece.style.left = '50%';
      piece.style.top = '50%';
      piece.style.background = palette[i % palette.length];
      piece.style.setProperty('--dx', `${dx}px`);
      piece.style.setProperty('--dy', `${dy}px`);
      piece.style.setProperty('--rotate', `${rotation}deg`);
      piece.style.setProperty('--delay', `${(i % 7) * 55}ms`);
      elements.effects.append(piece);
    }

    state.celebrationTimer = setTimeout(() => {
      elements.effects.replaceChildren();
    }, 1800);
  }

  function reachableCells() {
    const head = state.snake[0];
    if (!head) return new Set();
    const heading = Object.keys(DIRECTIONS).find((name) => DIRECTIONS[name] === state.direction);
    const blocked = new Set(state.snake.slice(0, -1).map((cell) => `${cell.x},${cell.y}`));
    state.enemies.forEach((enemy) => blocked.add(`${enemy.x},${enemy.y}`));
    const queue = [{ x: head.x, y: head.y, direction: heading }];
    const visited = new Set([`${head.x},${head.y},${heading}`]);
    const reachable = new Set([`${head.x},${head.y}`]);

    while (queue.length) {
      const current = queue.shift();
      Object.entries(DIRECTIONS).forEach(([name, direction]) => {
        if (direction.x === -DIRECTIONS[current.direction].x && direction.y === -DIRECTIONS[current.direction].y) return;
        const x = current.x + direction.x;
        const y = current.y + direction.y;
        const cellKey = `${x},${y}`;
        const stateKey = `${cellKey},${name}`;
        if (x < 0 || x >= state.cols || y < 0 || y >= state.rows || blocked.has(cellKey) || visited.has(stateKey)) return;
        visited.add(stateKey);
        reachable.add(cellKey);
        queue.push({ x, y, direction: name });
      });
    }
    return reachable;
  }

  function spawnCleanDrop() {
    const freeCells = [];
    const reachable = reachableCells();
    for (let y = 1; y < state.rows - 1; y += 1) {
      for (let x = 1; x < state.cols - 1; x += 1) {
        if (cellIsOccupied(x, y) || !reachable.has(`${x},${y}`)) continue;
        const openNeighbors = Object.values(DIRECTIONS).filter((direction) => {
          const nextX = x + direction.x;
          const nextY = y + direction.y;
          return nextX >= 0 && nextX < state.cols && nextY >= 0 && nextY < state.rows
            && !cellIsOccupied(nextX, nextY);
        });
        if (openNeighbors.length >= 2) freeCells.push({ x, y });
      }
    }
    const cell = freeCells[Math.floor(Math.random() * freeCells.length)] || null;
    if (cell) state.cleanDrop = { ...cell, id: state.nextEntityId++ };
    else if (state.phase === 'playing') {
      state.lossReason = 'trail';
      finishGame(false);
    }
    return state.cleanDrop;
  }

  function spawnEnemy() {
    const cell = findFreeCell();
    if (!cell) return null;
    const enemy = { ...cell, id: state.nextEntityId++ };
    state.enemies.push(enemy);
    return enemy;
  }

  function maintainEnemies() {
    while (state.enemies.length < state.enemyTarget) {
      if (!spawnEnemy()) break;
    }
  }

  function moveEnemies() {
    state.enemies.forEach((enemy) => {
      const candidates = [
        { x: enemy.x, y: enemy.y },
        ...Object.values(DIRECTIONS).map((direction) => ({ x: enemy.x + direction.x, y: enemy.y + direction.y }))
      ].filter((cell) => cell.x >= 0 && cell.x < state.cols && cell.y >= 0 && cell.y < state.rows
        && !cellIsOccupied(cell.x, cell.y, { ignoreEnemyId: enemy.id }));
      if (candidates.length) Object.assign(enemy, candidates[Math.floor(Math.random() * candidates.length)]);
    });
    renderItems();
  }

  function showOverlay(type) {
    const messages = {
      ready: {
        kicker: 'START HERE · EVERY DROP COUNTS',
        title: 'Water Quest',
        tagline: 'Every drop has a destination.',
          message: 'Steer continuously. Collect 8 clean drops before 1:15 runs out; each one grows your trail. Avoid contaminated water, the board edge, and your own trail.',
        button: 'Start Game',
        footnote: 'ARROWS / WASD · TAP ARROWS OR SWIPE'
      },
      won: {
        kicker: 'ROUTE COMPLETE · 100%',
        title: 'Every drop<br>made it home.',
        tagline: 'Amazing! You helped bring clean water to the community!',
        message: `Final score: ${state.score}. Clean water collected: ${state.delivered}. Longest trail: ${state.longestTrail} segments. Every community deserves clean water.`,
        button: 'Play again',
        footnote: 'ALL 8 DROPS DELIVERED'
      },
      lost: {
        kicker: 'THE ROUTE NEEDS ANOTHER TRY',
        title: state.lossReason === 'timer' ? 'The clock ran<br>out this time.' : state.lossReason === 'trail' ? 'The trail ran<br>too short.' : 'The route needs<br>another try.',
        tagline: state.lossReason === 'timer' ? 'The clean-water goal is still in reach.' : state.lossReason === 'trail' ? 'Pollution left too little water to continue.' : 'Every attempt brings the goal closer.',
        message: `Final score: ${state.score}. Clean water collected: ${state.delivered} of ${GOAL}. Longest trail: ${state.longestTrail} segments.`,
        button: 'Try again',
          footnote: 'ARROWS / WASD · TOUCH PAD OR SWIPE'
      }
    };
    const copy = messages[type];
    elements.overlayKicker.textContent = copy.kicker;
    elements.overlayTitle.innerHTML = copy.title;
    elements.overlayTagline.textContent = copy.tagline;
    elements.overlayMessage.textContent = copy.message;
    elements.overlayButtonText.textContent = copy.button;
    elements.overlayFootnote.textContent = copy.footnote;
    elements.overlay.dataset.visible = 'true';
    elements.overlay.dataset.state = type;
    elements.overlay.setAttribute('aria-modal', 'true');
    elements.overlayButton.focus({ preventScroll: true });
  }

  function finishGame(won) {
    if (state.phase !== 'playing') return;
    state.phase = won ? 'won' : 'lost';
    if (!won && state.lossReason === null) state.lossReason = 'lives';
    clearInterval(state.countdownTimer);
    clearTimeout(state.gameLoop);
    state.countdownTimer = null;
    state.gameLoop = null;
    elements.timeCard.classList.remove('is-urgent');
    if (won) {
      flash();
      launchCelebration();
    }
    showOverlay(won ? 'won' : 'lost');
    paintHud();
  }

  function scheduleGameLoop() {
    if (state.phase !== 'playing') return;
    const delay = Math.max(110, 175 - Math.floor(state.delivered / 2) * 10);
    state.gameLoop = setTimeout(() => {
      if (state.phase !== 'playing') return;
      advanceSnake();
      scheduleGameLoop();
    }, delay);
  }

  function startGame() {
    configureGrid();
    clearInterval(state.countdownTimer);
    clearTimeout(state.gameLoop);
    clearTimeout(state.toastTimer);
    clearTimeout(state.scoreTimer);
    clearTimeout(state.celebrationTimer);
    elements.effects.replaceChildren();
    elements.toast.classList.remove('is-visible');
    state.phase = 'playing';
    state.score = 0;
    state.delivered = 0;
    state.lives = 3;
    state.time = START_TIME;
    state.snake = [];
    state.cleanDrop = null;
    state.enemies = [];
    state.enemyTarget = 2;
    state.tickCount = 0;
    state.longestTrail = START_TRAIL;
    state.lossReason = null;
    state.nextEntityId = 0;
    state.toastMilestone = false;
    elements.toast.classList.remove('is-visible');
    elements.effects.replaceChildren();
    elements.stage.classList.remove('has-warning');
    elements.overlay.dataset.state = 'playing';
    resetTrail(START_TRAIL);
    spawnCleanDrop();
    maintainEnemies();
    renderGame();
    paintHud();
    elements.overlay.dataset.visible = 'false';
    elements.overlay.setAttribute('aria-modal', 'false');
    elements.stage.focus({ preventScroll: true });
    state.countdownTimer = setInterval(() => {
      if (state.phase !== 'playing') return;
      state.time = Math.max(0, state.time - 1);
      paintHud();
      if (state.time === 0) {
        state.lossReason = 'timer';
        finishGame(false);
      }
    }, 1000);
    scheduleGameLoop();
  }

  function loseLife(message) {
    if (state.phase !== 'playing') return;
    state.lives = Math.max(0, state.lives - 1);
    state.toastMilestone = false;
    announce(message);
    flash(true);
    if (state.lives === 0) {
      state.lossReason = 'lives';
      finishGame(false);
      return;
    }
    resetTrail(START_TRAIL);
    renderGame();
    paintHud();
    elements.player.classList.remove('bump');
    void elements.player.offsetWidth;
    elements.player.classList.add('bump');
  }

  function setDirection(name) {
    if (state.phase !== 'playing') return;
    const direction = DIRECTIONS[name];
    if (!direction || (direction.x === -state.direction.x && direction.y === -state.direction.y)) return;
    state.nextDirection = direction;
  }

  function advanceSnake() {
    state.direction = state.nextDirection;
    const head = state.snake[0];
    const nextHead = { x: head.x + state.direction.x, y: head.y + state.direction.y };
    if (nextHead.x < 0 || nextHead.x >= state.cols || nextHead.y < 0 || nextHead.y >= state.rows) {
      loseLife('Board edge · one life lost, route reset');
      return;
    }

    const cleanHit = state.cleanDrop?.x === nextHead.x && state.cleanDrop?.y === nextHead.y;
    const enemyIndex = state.enemies.findIndex((enemy) => enemy.x === nextHead.x && enemy.y === nextHead.y);
    const body = cleanHit ? state.snake : state.snake.slice(0, -1);
    if (body.some((segment) => segment.x === nextHead.x && segment.y === nextHead.y)) {
      loseLife('Own trail · one life lost, route reset');
      return;
    }

    state.tickCount += 1;
    const movedSnake = cleanHit
      ? [nextHead, ...state.snake]
      : [nextHead, ...state.snake.slice(0, -1)];

    if (cleanHit) {
      state.snake = movedSnake;
      state.cleanDrop = null;
      state.delivered += 1;
      state.score += 10;
      state.longestTrail = Math.max(state.longestTrail, state.snake.length);
      paintHud();
      animateScore();
      showEffect('splash-clean', nextHead);
      const milestone = MILESTONES.get(state.delivered);
      if (milestone) announce(milestone, true);
      else announce('Clean water collected · +10 points · trail +1');
      if ((state.delivered === 3 || state.delivered === 6) && state.enemyTarget < 4) {
        state.enemyTarget += 1;
      }
      maintainEnemies();
      if (state.delivered >= GOAL) {
        renderGame();
        finishGame(true);
        return;
      }
      spawnCleanDrop();
    } else if (enemyIndex !== -1) {
      state.enemies.splice(enemyIndex, 1);
      state.score = Math.max(0, state.score - 20);
      state.snake = movedSnake.slice(0, Math.max(0, movedSnake.length - 2));
      paintHud();
      animateScore();
      showEffect('splash-pollution', nextHead);
      flash(true);
      state.toastMilestone = false;
      if (state.snake.length < MIN_TRAIL) {
        announce('Contaminated water! The trail is too short to continue.');
        state.lossReason = 'trail';
        finishGame(false);
        return;
      }
      announce('Contaminated water! −2 trail segments, −20 points');
      maintainEnemies();
    } else {
      state.snake = movedSnake;
    }

    if (state.tickCount % ENEMY_MOVE_EVERY === 0) moveEnemies();
    renderTrail();
    renderItems();
  }

  function handleResize() {
    configureGrid();
  }

  const keyDirections = {
    ArrowUp: 'up', w: 'up', W: 'up',
    ArrowDown: 'down', s: 'down', S: 'down',
    ArrowLeft: 'left', a: 'left', A: 'left',
    ArrowRight: 'right', d: 'right', D: 'right'
  };

  document.addEventListener('keydown', (event) => {
    const direction = keyDirections[event.key];
    if (!direction || state.phase !== 'playing') return;
    event.preventDefault();
    setDirection(direction);
  });

  document.querySelectorAll('.move-button').forEach((button) => {
    button.addEventListener('click', () => setDirection(button.dataset.direction));
  });
  elements.overlayButton.addEventListener('click', startGame);
  document.querySelector('#restart-button').addEventListener('click', startGame);

  let pointerStart = null;
  elements.stage.addEventListener('pointerdown', (event) => {
    if (event.target.closest('button') || state.phase !== 'playing') return;
    pointerStart = { x: event.clientX, y: event.clientY };
  });
  elements.stage.addEventListener('pointerup', (event) => {
    if (!pointerStart) return;
    const dx = event.clientX - pointerStart.x;
    const dy = event.clientY - pointerStart.y;
    pointerStart = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
    setDirection(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
  });
  elements.stage.addEventListener('pointercancel', () => { pointerStart = null; });

  configureGrid();
  resetTrail();
  spawnCleanDrop();
  maintainEnemies();
  renderGame();
  paintHud();
  showOverlay('ready');
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(handleResize).observe(elements.stage);
  } else if (typeof window !== 'undefined') {
    window.addEventListener('resize', handleResize);
  }
})();