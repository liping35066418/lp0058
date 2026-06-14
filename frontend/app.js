const API_BASE = 'http://localhost:9718/api';
const STORAGE_KEY = 'memory_card_game_records';
const PROGRESS_KEY = 'memory_card_game_progress';

const appState = {
  currentScreen: 'startScreen',
  sessionId: null,
  level: 1,
  cards: [],
  cols: 4,
  rows: 2,
  pairs: 4,
  moves: 0,
  matchedPairs: 0,
  maxHints: 3,
  hintsUsed: 0,
  startTime: 0,
  timerInterval: null,
  isPaused: false,
  elapsedSeconds: 0,
  unlockedLevels: 1,
  bestRecords: [],
  combo: 0,
  maxCombo: 0
};

function $(id) {
  return document.getElementById(id);
}

function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $(screenId).classList.add('active');
  appState.currentScreen = screenId;
}

function showToast(message, duration = 2000) {
  const toast = $('toast');
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), duration);
}

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function updateComboDisplay() {
  const comboBar = $('comboBar');
  const comboCount = $('comboCount');
  const comboMultiplier = $('comboMultiplier');
  
  if (appState.combo > 0) {
    comboBar.style.display = 'flex';
    comboCount.textContent = appState.combo;
    comboMultiplier.textContent = `x${appState.combo}`;
    comboBar.classList.remove('combo-pulse');
    void comboBar.offsetWidth;
    comboBar.classList.add('combo-pulse');
  } else {
    comboBar.style.display = 'none';
  }
}

function saveToStorage(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (e) {
    console.warn('本地存储失败:', e);
  }
}

function loadFromStorage(key, defaultValue = null) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : defaultValue;
  } catch (e) {
    return defaultValue;
  }
}

function loadProgress() {
  const progress = loadFromStorage(PROGRESS_KEY, {});
  appState.unlockedLevels = progress.unlockedLevels || 1;
  appState.bestRecords = loadFromStorage(STORAGE_KEY, []);
}

function saveProgress() {
  saveToStorage(PROGRESS_KEY, {
    unlockedLevels: appState.unlockedLevels
  });
}

function saveRecord(record) {
  const records = loadFromStorage(STORAGE_KEY, []);
  records.unshift(record);
  if (records.length > 50) records.length = 50;
  saveToStorage(STORAGE_KEY, records);
  appState.bestRecords = records;
  
  if (record.level >= appState.unlockedLevels && record.level < 6) {
    appState.unlockedLevels = record.level + 1;
    saveProgress();
  }
}

async function apiRequest(endpoint, method = 'GET', body = null) {
  try {
    const options = {
      method,
      headers: { 'Content-Type': 'application/json' }
    };
    if (body) options.body = JSON.stringify(body);
    const response = await fetch(`${API_BASE}${endpoint}`, options);
    if (!response.ok) {
      throw new Error(`请求失败: ${response.status}`);
    }
    return await response.json();
  } catch (e) {
    console.error('API请求错误:', e);
    showToast('网络连接失败，请检查后端服务');
    throw e;
  }
}

async function loadLevels() {
  try {
    const levels = await apiRequest('/levels');
    renderLevelList(levels);
  } catch (e) {
    renderLevelListFallback();
  }
}

const FALLBACK_LEVELS = [
  { level: 1, pairs: 4, cols: 4, rows: 2, patternPool: 8, name: '新手入门' },
  { level: 2, pairs: 6, cols: 4, rows: 3, patternPool: 12, name: '初窥门径' },
  { level: 3, pairs: 8, cols: 4, rows: 4, patternPool: 16, name: '小试牛刀' },
  { level: 4, pairs: 10, cols: 5, rows: 4, patternPool: 20, name: '渐入佳境' },
  { level: 5, pairs: 12, cols: 6, rows: 4, patternPool: 24, name: '炉火纯青' },
  { level: 6, pairs: 16, cols: 8, rows: 4, patternPool: 32, name: '登峰造极' }
];

function renderLevelList(levels) {
  const container = $('levelList');
  container.innerHTML = '';
  
  levels.forEach(lv => {
    const item = document.createElement('div');
    const isLocked = lv.level > appState.unlockedLevels;
    const completed = appState.bestRecords.some(r => r.level === lv.level);
    
    item.className = `level-item${isLocked ? ' locked' : ''}${completed ? ' completed' : ''}`;
    item.innerHTML = `
      <span class="level-num">${isLocked ? '🔒' : lv.level}</span>
      <span class="level-name">${lv.name}</span>
      <span class="level-pairs">${lv.pairs}对卡牌</span>
    `;
    
    if (!isLocked) {
      item.addEventListener('click', () => startGame(lv.level));
    } else {
      item.addEventListener('click', () => {
        showToast(`先通过第 ${lv.level - 1} 关来解锁`);
      });
    }
    
    container.appendChild(item);
  });
}

function renderLevelListFallback() {
  renderLevelList(FALLBACK_LEVELS);
}

async function startGame(level) {
  try {
    const result = await apiRequest('/game/start', 'POST', { level });
    setupGame(result);
    showScreen('gameScreen');
  } catch (e) {
    console.error('启动游戏失败:', e);
  }
}

function setupGame(gameData) {
  appState.sessionId = gameData.sessionId;
  appState.level = gameData.level;
  appState.cols = gameData.cols;
  appState.rows = gameData.rows;
  appState.pairs = gameData.pairs;
  appState.cards = gameData.cards;
  appState.maxHints = gameData.maxHints;
  appState.hintsUsed = 0;
  appState.moves = 0;
  appState.matchedPairs = 0;
  appState.elapsedSeconds = 0;
  appState.isPaused = false;
  appState.combo = 0;
  appState.maxCombo = 0;
  
  $('currentLevelBadge').textContent = `第 ${gameData.level} 关`;
  $('currentLevelName').textContent = gameData.levelName;
  $('movesDisplay').textContent = '0';
  $('matchDisplay').textContent = `0/${gameData.pairs}`;
  $('timerDisplay').textContent = '00:00';
  $('hintCount').textContent = gameData.maxHints;
  $('hintBtn').disabled = false;
  
  updateComboDisplay();
  renderBoard();
  startTimer();
}

function renderBoard() {
  const board = $('gameBoard');
  board.innerHTML = '';
  board.style.gridTemplateColumns = `repeat(${appState.cols}, 1fr)`;
  
  const sortedCards = [...appState.cards].sort((a, b) => a.position - b.position);
  
  sortedCards.forEach(cardData => {
    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.id = cardData.id;
    card.innerHTML = `
      <div class="card-face card-back"></div>
      <div class="card-face card-front">
        <span class="card-pattern" data-pattern-id="${cardData.id}"></span>
      </div>
    `;
    card.addEventListener('click', () => onCardClick(cardData.id));
    card.addEventListener('touchstart', (e) => {
      e.preventDefault();
      onCardClick(cardData.id);
    }, { passive: false });
    board.appendChild(card);
  });
}

async function onCardClick(cardId) {
  if (appState.isPaused) return;
  
  const cardEl = document.querySelector(`.card[data-id="${cardId}"]`);
  if (!cardEl || cardEl.classList.contains('flipped') || cardEl.classList.contains('matched')) {
    return;
  }
  
  try {
    const result = await apiRequest('/game/flip', 'POST', {
      sessionId: appState.sessionId,
      cardId
    });
    
    if (result.invalid || result.isLocked) return;
    
    if (result.flipped) {
      flipCard(cardId, result.flipped.pattern);
    }
    
    if (result.moves !== undefined) {
      appState.moves = result.moves;
      $('movesDisplay').textContent = appState.moves;
    }
    
    if (result.isMatch === true && result.matchedCards) {
      setTimeout(() => {
        result.matchedCards.forEach(id => markMatched(id));
      }, 300);
      
      appState.matchedPairs = result.matchedPairs;
      $('matchDisplay').textContent = `${appState.matchedPairs}/${appState.pairs}`;
      
      if (result.combo !== undefined) {
        appState.combo = result.combo;
        if (appState.combo > appState.maxCombo) {
          appState.maxCombo = appState.combo;
        }
        updateComboDisplay();
      }
      
      if (result.status === 'won') {
        setTimeout(() => handleWin(result), 600);
      }
    } else if (result.isMatch === false && result.wrongCards) {
      setTimeout(() => {
        result.wrongCards.forEach(id => markWrong(id));
      }, 500);
      
      setTimeout(() => {
        result.wrongCards.forEach(id => unflipCard(id));
      }, 1200);
      
      appState.combo = 0;
      updateComboDisplay();
    }
  } catch (e) {
    console.error('翻牌失败:', e);
  }
}

function flipCard(cardId, pattern) {
  const cardEl = document.querySelector(`.card[data-id="${cardId}"]`);
  if (!cardEl) return;
  cardEl.classList.add('flipped');
  const patternEl = cardEl.querySelector('.card-pattern');
  if (patternEl) patternEl.textContent = pattern;
}

function unflipCard(cardId) {
  const cardEl = document.querySelector(`.card[data-id="${cardId}"]`);
  if (!cardEl) return;
  cardEl.classList.remove('flipped', 'wrong');
}

function markMatched(cardId) {
  const cardEl = document.querySelector(`.card[data-id="${cardId}"]`);
  if (!cardEl) return;
  cardEl.classList.add('matched');
  hapticFeedback('medium');
}

function markWrong(cardId) {
  const cardEl = document.querySelector(`.card[data-id="${cardId}"]`);
  if (!cardEl) return;
  cardEl.classList.add('wrong');
  hapticFeedback('light');
}

function hapticFeedback(type = 'light') {
  if (navigator.vibrate) {
    const patterns = { light: 10, medium: 20, heavy: 40 };
    navigator.vibrate(patterns[type] || 10);
  }
}

function startTimer() {
  stopTimer();
  appState.startTime = Date.now();
  appState.timerInterval = setInterval(() => {
    if (!appState.isPaused) {
      const now = Date.now();
      appState.elapsedSeconds = Math.floor((now - appState.startTime) / 1000);
      $('timerDisplay').textContent = formatTime(appState.elapsedSeconds);
    }
  }, 500);
}

function stopTimer() {
  if (appState.timerInterval) {
    clearInterval(appState.timerInterval);
    appState.timerInterval = null;
  }
}

function pauseTimer() {
  appState.isPaused = true;
}

function resumeTimer() {
  if (appState.isPaused) {
    appState.startTime = Date.now() - appState.elapsedSeconds * 1000;
    appState.isPaused = false;
  }
}

async function useHint() {
  if (appState.isPaused) return;
  if (appState.hintsUsed >= appState.maxHints) {
    showToast('提示次数已用完');
    return;
  }
  
  try {
    const result = await apiRequest('/game/hint', 'POST', {
      sessionId: appState.sessionId
    });
    
    if (result.noHint) {
      showToast(result.message || '无法使用提示');
      return;
    }
    
    if (result.hintPair) {
      appState.hintsUsed = result.hintsUsed;
      $('hintCount').textContent = result.remainingHints;
      if (result.remainingHints <= 0) {
        $('hintBtn').disabled = true;
      }
      
      result.hintPair.forEach(id => {
        const cardEl = document.querySelector(`.card[data-id="${id}"]`);
        if (cardEl) {
          cardEl.classList.add('hint', 'flipped');
        }
      });
      
      setTimeout(() => {
        result.hintPair.forEach(id => {
          const cardEl = document.querySelector(`.card[data-id="${id}"]`);
          if (cardEl && !cardEl.classList.contains('matched')) {
            cardEl.classList.remove('hint', 'flipped');
          }
        });
      }, 1600);
      
      hapticFeedback('medium');
    }
  } catch (e) {
    console.error('提示失败:', e);
  }
}

async function resetGame() {
  try {
    const result = await apiRequest('/game/reset', 'POST', {
      sessionId: appState.sessionId
    });
    setupGame(result);
    showToast('已重置本局');
  } catch (e) {
    console.error('重置失败:', e);
  }
}

function pauseGame() {
  pauseTimer();
  $('pauseModal').classList.add('active');
}

function resumeGame() {
  resumeTimer();
  $('pauseModal').classList.remove('active');
}

function exitGame() {
  stopTimer();
  $('pauseModal').classList.remove('active');
  showScreen('startScreen');
  loadLevels();
}

async function handleWin(result) {
  stopTimer();
  
  const finalScore = result.score;
  const maxCombo = result.maxCombo || appState.maxCombo;
  
  $('winTime').textContent = formatTime(result.elapsedTime);
  $('winMoves').textContent = appState.moves;
  $('winMaxCombo').textContent = maxCombo;
  $('winScore').textContent = finalScore;
  
  const record = {
    level: appState.level,
    time: result.elapsedTime,
    moves: appState.moves,
    score: finalScore,
    maxCombo: maxCombo,
    date: new Date().toISOString()
  };
  saveRecord(record);
  
  try {
    const saveResult = await apiRequest('/score/save', 'POST', {
      playerId: 'guest_' + Math.random().toString(36).slice(2, 8),
      record: {
        ...record,
        playerName: '匿名玩家'
      }
    });
    
    if (saveResult && saveResult.rank) {
      $('winRankNumber').textContent = saveResult.rank;
      $('winRank').style.display = 'block';
    }
  } catch (e) {
    console.warn('保存分数到后端失败:', e);
  }
  
  createConfetti();
  showScreen('winScreen');
  hapticFeedback('heavy');
}

function createConfetti() {
  const container = $('confettiContainer');
  container.innerHTML = '';
  
  const colors = ['#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff', '#ff6eb4', '#c9b1ff'];
  const count = 80;
  
  for (let i = 0; i < count; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
    piece.style.animationDelay = `${Math.random() * 1.5}s`;
    piece.style.animationDuration = `${2 + Math.random() * 2}s`;
    piece.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
    piece.style.width = `${6 + Math.random() * 8}px`;
    piece.style.height = `${6 + Math.random() * 8}px`;
    container.appendChild(piece);
  }
}

function renderRecords() {
  const container = $('recordsList');
  const records = loadFromStorage(STORAGE_KEY, []);
  
  if (records.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📭</div>
        <div class="empty-state-text">暂无游戏记录</div>
      </div>
    `;
    return;
  }
  
  container.innerHTML = '';
  
  records.forEach(record => {
    const item = document.createElement('div');
    item.className = 'record-item';
    const date = new Date(record.date);
    const dateStr = `${date.getMonth() + 1}/${date.getDate()} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
    
    item.innerHTML = `
      <div class="record-left">
        <span class="record-level">第 ${record.level} 关</span>
        <span class="record-date">${dateStr}</span>
      </div>
      <div class="record-right">
        <div class="record-stat">
          <span>用时</span>
          <span>${formatTime(record.time)}</span>
        </div>
        <div class="record-stat">
          <span>步数</span>
          <span>${record.moves}</span>
        </div>
        <div class="record-stat">
          <span>连击</span>
          <span>${record.maxCombo || 0}</span>
        </div>
        <span class="record-score">${record.score}</span>
      </div>
    `;
    container.appendChild(item);
  });
}

function clearRecords() {
  if (confirm('确定要清空所有历史记录吗？')) {
    localStorage.removeItem(STORAGE_KEY);
    appState.bestRecords = [];
    renderRecords();
    showToast('已清空所有记录');
  }
}

let currentLeaderboardLevel = 1;

async function showLeaderboard() {
  renderLeaderboardTabs();
  await loadLeaderboard(currentLeaderboardLevel);
  showScreen('leaderboardScreen');
}

function renderLeaderboardTabs() {
  const container = $('leaderboardLevelTabs');
  container.innerHTML = '';
  
  for (let i = 1; i <= 6; i++) {
    const tab = document.createElement('button');
    tab.className = `level-tab${i === currentLeaderboardLevel ? ' active' : ''}`;
    tab.textContent = `第${i}关`;
    tab.addEventListener('click', () => {
      currentLeaderboardLevel = i;
      renderLeaderboardTabs();
      loadLeaderboard(i);
    });
    container.appendChild(tab);
  }
}

async function loadLeaderboard(level) {
  const container = $('leaderboardList');
  container.innerHTML = `
    <div class="empty-state">
      <div class="empty-state-icon">⏳</div>
      <div class="empty-state-text">加载中...</div>
    </div>
  `;
  
  try {
    const result = await apiRequest(`/score/top?level=${level}&limit=10`);
    
    if (!result.scores || result.scores.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">🏆</div>
          <div class="empty-state-text">暂无排行记录</div>
          <div class="empty-state-hint">通关后即可上榜</div>
        </div>
      `;
      return;
    }
    
    container.innerHTML = '';
    
    result.scores.forEach((score, index) => {
      const item = document.createElement('div');
      item.className = `leaderboard-item top-${index + 1}`;
      
      const date = new Date(score.date || score.createdAt);
      const dateStr = `${date.getMonth() + 1}/${date.getDate()}`;
      
      let rankIcon = '';
      if (index === 0) rankIcon = '🥇';
      else if (index === 1) rankIcon = '🥈';
      else if (index === 2) rankIcon = '🥉';
      
      item.innerHTML = `
        <div class="leaderboard-rank">
          <span class="leaderboard-rank-num">${rankIcon || (index + 1)}</span>
        </div>
        <div class="leaderboard-info">
          <span class="leaderboard-name">${score.playerName || '匿名玩家'}</span>
          <div class="leaderboard-stats">
            <span>⏱️ ${formatTime(score.time || 0)}</span>
            <span>👆 ${score.moves || 0}步</span>
            <span>🔥 ${score.maxCombo || 0}连</span>
            <span>📅 ${dateStr}</span>
          </div>
        </div>
        <div class="leaderboard-score">${score.score}</div>
      `;
      
      container.appendChild(item);
    });
  } catch (e) {
    console.error('加载排行榜失败:', e);
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">❌</div>
        <div class="empty-state-text">加载失败</div>
        <div class="empty-state-hint">请检查后端服务</div>
      </div>
    `;
  }
}

function bindEvents() {
  $('quickStartBtn').addEventListener('click', () => startGame(appState.unlockedLevels));
  $('showRecordsBtn').addEventListener('click', () => {
    renderRecords();
    showScreen('recordsScreen');
  });
  $('showLeaderboardBtn').addEventListener('click', showLeaderboard);
  $('leaderboardBackBtn').addEventListener('click', () => showScreen('startScreen'));
  
  $('backBtn').addEventListener('click', () => {
    pauseGame();
  });
  
  $('menuBtn').addEventListener('click', pauseGame);
  
  $('hintBtn').addEventListener('click', useHint);
  $('resetBtn').addEventListener('click', () => {
    if (confirm('确定要重置本局吗？')) {
      resetGame();
    }
  });
  $('pauseBtn').addEventListener('click', pauseGame);
  
  $('resumeBtn').addEventListener('click', resumeGame);
  $('restartBtn').addEventListener('click', () => {
    $('pauseModal').classList.remove('active');
    resetGame();
  });
  $('exitBtn').addEventListener('click', exitGame);
  
  $('nextLevelBtn').addEventListener('click', () => {
    const nextLevel = Math.min(appState.level + 1, 6);
    startGame(nextLevel);
  });
  $('replayBtn').addEventListener('click', () => startGame(appState.level));
  $('backHomeBtn').addEventListener('click', () => {
    showScreen('startScreen');
    loadLevels();
  });
  
  $('recordsBackBtn').addEventListener('click', () => showScreen('startScreen'));
  $('clearRecordsBtn').addEventListener('click', clearRecords);
  
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && appState.currentScreen === 'gameScreen' && !appState.isPaused) {
      pauseGame();
    }
  });
}

function init() {
  loadProgress();
  loadLevels();
  bindEvents();
  showScreen('startScreen');
}

document.addEventListener('DOMContentLoaded', init);
