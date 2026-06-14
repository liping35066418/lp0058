const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 9718;
const SCORES_FILE = path.join(__dirname, 'scores.json');

app.use(cors());
app.use(express.json());

const CARD_PATTERNS = [
  '🍎', '🍊', '🍋', '🍇', '🍓', '🍒', '🍑', '🥝',
  '🌟', '🌙', '☀️', '⭐', '🌈', '❄️', '🔥', '💧',
  '🎈', '🎁', '🎂', '🎵', '🎮', '🎨', '🎯', '🎲',
  '🐶', '🐱', '🐼', '🐨', '🦊', '🦁', '🐯', '🐸'
];

const LEVEL_CONFIG = [
  { level: 1, pairs: 4, cols: 4, rows: 2, patternPool: 8, name: '新手入门' },
  { level: 2, pairs: 6, cols: 4, rows: 3, patternPool: 12, name: '初窥门径' },
  { level: 3, pairs: 8, cols: 4, rows: 4, patternPool: 16, name: '小试牛刀' },
  { level: 4, pairs: 10, cols: 5, rows: 4, patternPool: 20, name: '渐入佳境' },
  { level: 5, pairs: 12, cols: 6, rows: 4, patternPool: 24, name: '炉火纯青' },
  { level: 6, pairs: 16, cols: 8, rows: 4, patternPool: 32, name: '登峰造极' }
];

function shuffleArray(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function generateCards(levelConfig) {
  const availablePatterns = shuffleArray(CARD_PATTERNS).slice(0, levelConfig.patternPool);
  const selectedPatterns = availablePatterns.slice(0, levelConfig.pairs);
  let cards = [];
  selectedPatterns.forEach((pattern, index) => {
    cards.push({ id: index * 2, pattern, isFlipped: false, isMatched: false });
    cards.push({ id: index * 2 + 1, pattern, isFlipped: false, isMatched: false });
  });
  return shuffleArray(cards).map((card, idx) => ({ ...card, position: idx }));
}

const gameSessions = new Map();

function loadScores() {
  try {
    if (fs.existsSync(SCORES_FILE)) {
      const data = fs.readFileSync(SCORES_FILE, 'utf-8');
      return JSON.parse(data);
    }
  } catch (e) {
    console.error('读取分数文件失败:', e);
  }
  return {};
}

function saveScores(scores) {
  try {
    fs.writeFileSync(SCORES_FILE, JSON.stringify(scores, null, 2), 'utf-8');
    return true;
  } catch (e) {
    console.error('保存分数文件失败:', e);
    return false;
  }
}

function getTopScores(level, limit = 10) {
  const allScores = loadScores();
  const levelScores = allScores[level] || [];
  return levelScores
    .sort((a, b) => b.score - a.score || a.time - b.time)
    .slice(0, limit);
}

function insertScore(level, record) {
  const allScores = loadScores();
  if (!allScores[level]) {
    allScores[level] = [];
  }
  
  const entry = {
    ...record,
    id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
    createdAt: Date.now()
  };
  
  allScores[level].push(entry);
  allScores[level].sort((a, b) => b.score - a.score || a.time - b.time);
  
  const rank = allScores[level].findIndex(s => s.id === entry.id) + 1;
  
  saveScores(allScores);
  
  return { rank, total: allScores[level].length, entry };
}

app.get('/api/levels', (req, res) => {
  res.json(LEVEL_CONFIG);
});

app.post('/api/game/start', (req, res) => {
  const { level = 1, playerId } = req.body;
  const config = LEVEL_CONFIG.find(l => l.level === level) || LEVEL_CONFIG[0];
  const cards = generateCards(config);
  const sessionId = Date.now().toString() + Math.random().toString(36).slice(2, 8);
  
  const session = {
    sessionId,
    playerId: playerId || 'guest',
    level: config.level,
    levelName: config.name,
    cols: config.cols,
    rows: config.rows,
    pairs: config.pairs,
    cards,
    firstCard: null,
    secondCard: null,
    isLocked: false,
    moves: 0,
    matchedPairs: 0,
    startTime: Date.now(),
    elapsedTime: 0,
    hintsUsed: 0,
    maxHints: Math.max(1, Math.floor(config.pairs / 4)),
    status: 'playing',
    score: 0,
    combo: 0,
    maxCombo: 0,
    comboBonus: 0,
    basePairScore: 50
  };
  
  gameSessions.set(sessionId, session);
  
  res.json({
    sessionId,
    level: session.level,
    levelName: session.levelName,
    cols: session.cols,
    rows: session.rows,
    pairs: session.pairs,
    cards: session.cards.map(c => ({ id: c.id, position: c.position, isFlipped: false, isMatched: false })),
    maxHints: session.maxHints,
    hintsUsed: 0
  });
});

app.post('/api/game/flip', (req, res) => {
  const { sessionId, cardId } = req.body;
  const session = gameSessions.get(sessionId);
  
  if (!session) {
    return res.status(404).json({ error: '游戏会话不存在' });
  }
  
  if (session.status !== 'playing') {
    return res.json({ status: session.status, message: '游戏已结束' });
  }
  
  if (session.isLocked) {
    return res.json({ isLocked: true });
  }
  
  const card = session.cards.find(c => c.id === cardId);
  if (!card) {
    return res.status(404).json({ error: '卡牌不存在' });
  }
  
  if (card.isFlipped || card.isMatched) {
    return res.json({ invalid: true, message: '卡牌已翻开或已匹配' });
  }
  
  card.isFlipped = true;
  
  let result = {
    flipped: { id: card.id, pattern: card.pattern },
    isLocked: false,
    isMatch: null,
    moves: session.moves,
    matchedPairs: session.matchedPairs,
    combo: session.combo
  };
  
  if (!session.firstCard) {
    session.firstCard = card;
  } else {
    session.secondCard = card;
    session.moves++;
    result.moves = session.moves;
    
    if (session.firstCard.pattern === session.secondCard.pattern) {
      session.firstCard.isMatched = true;
      session.secondCard.isMatched = true;
      session.matchedPairs++;
      
      session.combo++;
      if (session.combo > session.maxCombo) {
        session.maxCombo = session.combo;
      }
      
      const pairScore = session.basePairScore * session.combo;
      session.comboBonus += pairScore;
      session.score += pairScore;
      
      result.isMatch = true;
      result.matchedPairs = session.matchedPairs;
      result.matchedCards = [session.firstCard.id, session.secondCard.id];
      result.combo = session.combo;
      result.pairScore = pairScore;
      
      session.firstCard = null;
      session.secondCard = null;
      
      if (session.matchedPairs === session.pairs) {
        session.status = 'won';
        session.elapsedTime = Math.floor((Date.now() - session.startTime) / 1000);
        const timeBonus = Math.max(0, 1000 - session.elapsedTime * 2);
        const moveBonus = Math.max(0, 500 - (session.moves - session.pairs) * 10);
        const hintPenalty = session.hintsUsed * 50;
        const levelBase = session.level * 100;
        session.score = levelBase + timeBonus + moveBonus + session.comboBonus - hintPenalty;
        session.score = Math.max(100, session.score);
        result.status = 'won';
        result.elapsedTime = session.elapsedTime;
        result.score = session.score;
        result.totalPairs = session.pairs;
        result.maxCombo = session.maxCombo;
        result.comboBonus = session.comboBonus;
      }
    } else {
      result.isMatch = false;
      session.combo = 0;
      result.combo = 0;
      session.isLocked = true;
      result.wrongCards = [session.firstCard.id, session.secondCard.id];
      
      setTimeout(() => {
        if (session.firstCard) session.firstCard.isFlipped = false;
        if (session.secondCard) session.secondCard.isFlipped = false;
        session.firstCard = null;
        session.secondCard = null;
        session.isLocked = false;
      }, 1000);
    }
  }
  
  res.json(result);
});

app.post('/api/game/hint', (req, res) => {
  const { sessionId } = req.body;
  const session = gameSessions.get(sessionId);
  
  if (!session) {
    return res.status(404).json({ error: '游戏会话不存在' });
  }
  
  if (session.status !== 'playing') {
    return res.json({ status: session.status });
  }
  
  if (session.hintsUsed >= session.maxHints) {
    return res.json({ noHint: true, message: '提示次数已用完' });
  }
  
  const unmatched = session.cards.filter(c => !c.isMatched);
  const patternMap = new Map();
  
  for (const card of unmatched) {
    if (patternMap.has(card.pattern)) {
      session.hintsUsed++;
      const pair = [patternMap.get(card.pattern), card.id];
      
      pair.forEach(id => {
        const c = session.cards.find(x => x.id === id);
        if (c) c.isFlipped = true;
      });
      
      setTimeout(() => {
        pair.forEach(id => {
          const c = session.cards.find(x => x.id === id);
          if (c && !c.isMatched) c.isFlipped = false;
        });
      }, 1500);
      
      return res.json({
        hintPair: pair,
        hintsUsed: session.hintsUsed,
        remainingHints: session.maxHints - session.hintsUsed
      });
    }
    patternMap.set(card.pattern, card.id);
  }
  
  res.json({ noHint: true });
});

app.post('/api/game/reset', (req, res) => {
  const { sessionId } = req.body;
  const session = gameSessions.get(sessionId);
  
  if (!session) {
    return res.status(404).json({ error: '游戏会话不存在' });
  }
  
  const config = LEVEL_CONFIG.find(l => l.level === session.level) || LEVEL_CONFIG[0];
  const cards = generateCards(config);
  
  session.cards = cards;
  session.firstCard = null;
  session.secondCard = null;
  session.isLocked = false;
  session.moves = 0;
  session.matchedPairs = 0;
  session.startTime = Date.now();
  session.elapsedTime = 0;
  session.hintsUsed = 0;
  session.status = 'playing';
  session.score = 0;
  session.combo = 0;
  session.maxCombo = 0;
  session.comboBonus = 0;
  
  res.json({
    sessionId,
    level: session.level,
    levelName: session.levelName,
    cols: session.cols,
    rows: session.rows,
    pairs: session.pairs,
    cards: session.cards.map(c => ({ id: c.id, position: c.position, isFlipped: false, isMatched: false })),
    maxHints: session.maxHints,
    hintsUsed: 0
  });
});

app.post('/api/game/time', (req, res) => {
  const { sessionId } = req.body;
  const session = gameSessions.get(sessionId);
  
  if (!session) {
    return res.status(404).json({ error: '游戏会话不存在' });
  }
  
  const elapsed = Math.floor((Date.now() - session.startTime) / 1000);
  session.elapsedTime = elapsed;
  
  res.json({
    elapsedTime: elapsed,
    moves: session.moves,
    matchedPairs: session.matchedPairs,
    status: session.status
  });
});

app.post('/api/score/save', (req, res) => {
  const { playerId, record } = req.body;
  if (!playerId || !record || record.level === undefined || record.score === undefined) {
    return res.status(400).json({ error: '缺少必要参数' });
  }
  
  const scoreRecord = {
    playerId: playerId || 'guest',
    playerName: record.playerName || '匿名玩家',
    level: record.level,
    score: record.score,
    time: record.time || 0,
    moves: record.moves || 0,
    maxCombo: record.maxCombo || 0,
    date: record.date || new Date().toISOString()
  };
  
  const result = insertScore(record.level, scoreRecord);
  
  res.json({
    saved: true,
    rank: result.rank,
    total: result.total,
    isNewRecord: result.rank === 1
  });
});

app.get('/api/score/top', (req, res) => {
  const level = parseInt(req.query.level) || 1;
  const limit = parseInt(req.query.limit) || 10;
  
  const topScores = getTopScores(level, limit);
  
  res.json({
    level,
    total: topScores.length,
    scores: topScores
  });
});

app.listen(PORT, () => {
  console.log(`🎮 记忆卡牌游戏后端服务已启动: http://localhost:${PORT}`);
  console.log(`📡 API 端口: ${PORT}`);
});
