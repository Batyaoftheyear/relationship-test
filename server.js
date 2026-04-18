const fs = require('fs');
const path = require('path');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const ANALYTICS_FILE = path.join(DATA_DIR, 'analytics.json');

app.use(express.json({ limit: '100kb' }));
app.use(express.static(PUBLIC_DIR));

app.get('/', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.post('/api/analytics/result', (req, res) => {
  try {
    const payload = sanitizeAnalyticsPayload(req.body);

    if (!payload) {
      return res.status(400).json({ ok: false, error: 'invalid_payload' });
    }

    const db = readAnalytics();
    applyAnalyticsEvent(db, payload);
    writeAnalytics(db);

    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ ok: false, error: 'analytics_write_failed' });
  }
});

app.get('/api/analytics/summary', (req, res) => {
  try {
    const db = readAnalytics();
    const summary = buildSummary(db);
    return res.json(summary);
  } catch (error) {
    return res.status(500).json({ ok: false, error: 'analytics_read_failed' });
  }
});

app.listen(PORT, () => {
  console.log(`http://localhost:${PORT}`);
});

function createEmptyAnalytics() {
  return {
    version: 1,
    submissions: 0,
    sums: {
      x: 0,
      y: 0,
      distancePercent: 0,
      confidence: 0,
      neutralCount: 0
    },
    quadrants: {
      'Гибкое партнёрство': 0,
      'Стратегическая конкуренция': 0,
      'Структурированное партнёрство': 0,
      'Фиксированная конкуренция': 0
    },
    bands: {
      x: {
        'Сильное партнёрство': 0,
        'Умеренное партнёрство': 0,
        'Смешанная позиция': 0,
        'Умеренная конкуренция': 0,
        'Выраженная конкуренция': 0
      },
      y: {
        'Высокая агентность': 0,
        'Умеренная агентность': 0,
        'Смешанная позиция': 0,
        'Умеренный детерминизм': 0,
        'Выраженный детерминизм': 0
      },
      distance: {
        'Очень умеренная': 0,
        'Умеренная': 0,
        'Выраженная': 0,
        'Сильная': 0,
        'Очень сильная': 0
      },
      confidence: {
        'Высокая': 0,
        'Умеренная': 0,
        'Смешанная': 0,
        'Низкая': 0
      }
    },
    perQuestion: createQuestionBuckets(),
    daily: {}
  };
}

function createQuestionBuckets() {
  const buckets = {};
  for (let i = 1; i <= 24; i += 1) {
    buckets[String(i)] = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  }
  return buckets;
}

function readAnalytics() {
  ensureAnalyticsFile();

  try {
    const raw = fs.readFileSync(ANALYTICS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && parsed.version === 1 ? parsed : createEmptyAnalytics();
  } catch (error) {
    return createEmptyAnalytics();
  }
}

function writeAnalytics(db) {
  ensureAnalyticsFile();
  fs.writeFileSync(ANALYTICS_FILE, JSON.stringify(db, null, 2), 'utf8');
}

function ensureAnalyticsFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(ANALYTICS_FILE)) {
    fs.writeFileSync(ANALYTICS_FILE, JSON.stringify(createEmptyAnalytics(), null, 2), 'utf8');
  }
}

function sanitizeAnalyticsPayload(input) {
  if (!input || typeof input !== 'object') return null;

  const result = input.result;
  const answers = input.answers;
  if (!result || typeof result !== 'object' || !answers || typeof answers !== 'object') return null;

  const x = toInteger(result?.normalized?.x);
  const y = toInteger(result?.normalized?.y);
  const distancePercent = toInteger(result?.distance?.percent);
  const confidence = toInteger(result?.confidence?.value);
  const neutralCount = toInteger(result?.confidence?.neutralCount);
  const quadrant = typeof result?.quadrant === 'string' ? result.quadrant : '';

  if (!isFiniteNumber(x) || !isFiniteNumber(y)) return null;
  if (!isFiniteNumber(distancePercent) || !isFiniteNumber(confidence) || !isFiniteNumber(neutralCount)) return null;
  if (!['Гибкое партнёрство', 'Стратегическая конкуренция', 'Структурированное партнёрство', 'Фиксированная конкуренция'].includes(quadrant)) return null;

  const safeAnswers = {};
  for (let i = 1; i <= 24; i += 1) {
    const value = toInteger(answers[String(i)]);
    if (![1, 2, 3, 4, 5].includes(value)) return null;
    safeAnswers[String(i)] = value;
  }

  return {
    timestamp: typeof input.timestamp === 'string' ? input.timestamp : new Date().toISOString(),
    result: {
      normalized: { x: clamp(x, -100, 100), y: clamp(y, -100, 100) },
      distance: { percent: clamp(distancePercent, 0, 100) },
      confidence: {
        value: clamp(confidence, 0, 100),
        neutralCount: clamp(neutralCount, 0, 24)
      },
      quadrant
    },
    answers: safeAnswers
  };
}

function applyAnalyticsEvent(db, payload) {
  db.submissions += 1;
  db.sums.x += payload.result.normalized.x;
  db.sums.y += payload.result.normalized.y;
  db.sums.distancePercent += payload.result.distance.percent;
  db.sums.confidence += payload.result.confidence.value;
  db.sums.neutralCount += payload.result.confidence.neutralCount;

  db.quadrants[payload.result.quadrant] += 1;

  db.bands.x[getXBand(payload.result.normalized.x)] += 1;
  db.bands.y[getYBand(payload.result.normalized.y)] += 1;
  db.bands.distance[getDistanceBand(payload.result.distance.percent)] += 1;
  db.bands.confidence[getConfidenceBand(payload.result.confidence.value)] += 1;

  Object.entries(payload.answers).forEach(([questionId, value]) => {
    db.perQuestion[questionId][String(value)] += 1;
  });

  const dayKey = normalizeDay(payload.timestamp);
  db.daily[dayKey] = (db.daily[dayKey] || 0) + 1;
}

function buildSummary(db) {
  const n = db.submissions || 0;
  const averages = n > 0
    ? {
      x: round1(db.sums.x / n),
      y: round1(db.sums.y / n),
      distancePercent: round1(db.sums.distancePercent / n),
      confidence: round1(db.sums.confidence / n),
      neutralCount: round1(db.sums.neutralCount / n)
    }
    : { x: 0, y: 0, distancePercent: 0, confidence: 0, neutralCount: 0 };

  const perQuestion = {};
  for (let i = 1; i <= 24; i += 1) {
    const key = String(i);
    const bucket = db.perQuestion[key];
    const total = bucket['1'] + bucket['2'] + bucket['3'] + bucket['4'] + bucket['5'];
    const mean = total > 0
      ? round2((bucket['1'] * 1 + bucket['2'] * 2 + bucket['3'] * 3 + bucket['4'] * 4 + bucket['5'] * 5) / total)
      : 0;

    perQuestion[key] = {
      total,
      mean,
      counts: bucket
    };
  }

  return {
    ok: true,
    submissions: n,
    averages,
    quadrants: db.quadrants,
    bands: db.bands,
    daily: db.daily,
    perQuestion
  };
}

function getXBand(x) {
  if (x >= 35) return 'Сильное партнёрство';
  if (x >= 10) return 'Умеренное партнёрство';
  if (x >= -9) return 'Смешанная позиция';
  if (x >= -34) return 'Умеренная конкуренция';
  return 'Выраженная конкуренция';
}

function getYBand(y) {
  if (y >= 35) return 'Высокая агентность';
  if (y >= 10) return 'Умеренная агентность';
  if (y >= -9) return 'Смешанная позиция';
  if (y >= -34) return 'Умеренный детерминизм';
  return 'Выраженный детерминизм';
}

function getDistanceBand(distance) {
  if (distance <= 19) return 'Очень умеренная';
  if (distance <= 39) return 'Умеренная';
  if (distance <= 59) return 'Выраженная';
  if (distance <= 79) return 'Сильная';
  return 'Очень сильная';
}

function getConfidenceBand(confidence) {
  if (confidence >= 80) return 'Высокая';
  if (confidence >= 60) return 'Умеренная';
  if (confidence >= 40) return 'Смешанная';
  return 'Низкая';
}

function normalizeDay(timestamp) {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString().slice(0, 10);
  }
  return date.toISOString().slice(0, 10);
}

function toInteger(value) {
  if (typeof value === 'number') return Math.round(value);
  if (typeof value === 'string' && value.trim() !== '') return Math.round(Number(value));
  return NaN;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

function round2(value) {
  return Math.round(value * 100) / 100;
}
