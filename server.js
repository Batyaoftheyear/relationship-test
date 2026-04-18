const fs = require('fs');
const path = require('path');
require('dotenv').config({ quiet: true });
const express = require('express');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;

const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
const ANALYTICS_FILE = path.join(DATA_DIR, 'analytics.json');
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const supabase = SUPABASE_URL && SUPABASE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } })
  : null;
const TOTAL_QUESTIONS = 28;
const LEGACY_QUESTION_COUNT = 24;
const QUADRANTS = [
  'Гибкое партнёрство',
  'Стратегическая конкуренция',
  'Структурированное партнёрство',
  'Фиксированная конкуренция'
];
const QUESTION_SCORING = {
  xPositive: [1, 3, 5, 7, 9, 11, 25],
  xNegative: [2, 4, 6, 8, 10, 12, 26],
  yPositive: [13, 15, 17, 19, 21, 23, 24],
  yNegative: [14, 16, 18, 20, 22, 27, 28]
};

app.use(express.json({ limit: '100kb' }));
app.use(express.static(PUBLIC_DIR));

app.get('/', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

app.post('/api/analytics/result', async (req, res) => {
  try {
    const payload = sanitizeAnalyticsPayload(req.body);

    if (!payload) {
      return res.status(400).json({ ok: false, error: 'invalid_payload' });
    }

    await saveAnalyticsEvent(payload);
    return res.json({ ok: true });
  } catch (error) {
    console.error('Analytics write failed:', error.message);
    return res.status(500).json({ ok: false, error: 'analytics_write_failed' });
  }
});

app.get('/api/analytics/summary', async (req, res) => {
  try {
    const summary = await getAnalyticsSummary();
    return res.json(summary);
  } catch (error) {
    console.error('Analytics read failed:', error.message);
    return res.status(500).json({ ok: false, error: 'analytics_read_failed' });
  }
});

app.listen(PORT, () => {
  console.log(`http://localhost:${PORT}`);
});

async function saveAnalyticsEvent(payload) {
  if (supabase) {
    const { error } = await supabase.from('test_results').insert(toSupabaseRow(payload));
    if (error) throw error;
    return;
  }

  const db = readAnalytics();
  applyAnalyticsEvent(db, payload);
  writeAnalytics(db);
}

async function getAnalyticsSummary() {
  if (supabase) {
    const { data, error } = await supabase
      .from('test_results')
      .select('created_at,x_norm,y_norm,raw_x,raw_y,quadrant,distance_percent,confidence,neutral_count,answers')
      .order('created_at', { ascending: false })
      .limit(5000);

    if (error) throw error;
    return buildSummaryFromRows(data || []);
  }

  return buildSummary(readAnalytics());
}

function toSupabaseRow(payload) {
  return {
    created_at: payload.timestamp,
    x_norm: payload.result.normalized.x,
    y_norm: payload.result.normalized.y,
    raw_x: payload.result.raw.x,
    raw_y: payload.result.raw.y,
    quadrant: payload.result.quadrant,
    distance_percent: payload.result.distance.percent,
    confidence: payload.result.confidence.value,
    neutral_count: payload.result.confidence.neutralCount,
    answers: payload.answers
  };
}

function buildSummaryFromRows(rows) {
  const db = createEmptyAnalytics();

  for (const row of rows) {
    const payload = rowToAnalyticsPayload(row);
    if (payload) applyAnalyticsEvent(db, payload);
  }

  return buildSummary(db);
}

function rowToAnalyticsPayload(row) {
  if (!row || typeof row !== 'object') return null;

  const quadrant = typeof row.quadrant === 'string' ? row.quadrant : '';
  if (!QUADRANTS.includes(quadrant)) {
    return null;
  }

  const answers = {};
  const sourceAnswers = row.answers && typeof row.answers === 'object' ? row.answers : {};
  for (let i = 1; i <= TOTAL_QUESTIONS; i += 1) {
    if (!Object.prototype.hasOwnProperty.call(sourceAnswers, String(i))) {
      continue;
    }

    const value = toInteger(sourceAnswers[String(i)]);
    if (![1, 2, 3, 4, 5].includes(value)) return null;
    answers[String(i)] = value;
  }

  if (Object.keys(answers).length < LEGACY_QUESTION_COUNT) return null;

  return {
    timestamp: typeof row.created_at === 'string' ? row.created_at : new Date().toISOString(),
    result: {
      raw: {
        x: clamp(toInteger(row.raw_x), -28, 28),
        y: clamp(toInteger(row.raw_y), -28, 28)
      },
      normalized: {
        x: clamp(toInteger(row.x_norm), -100, 100),
        y: clamp(toInteger(row.y_norm), -100, 100)
      },
      distance: { percent: clamp(toInteger(row.distance_percent), 0, 100) },
      confidence: {
        value: clamp(toInteger(row.confidence), 0, 100),
        neutralCount: clamp(toInteger(row.neutral_count), 0, TOTAL_QUESTIONS)
      },
      quadrant
    },
    answers
  };
}

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
        'Сильная открытость': 0,
        'Умеренная открытость': 0,
        'Смешанная позиция': 0,
        'Умеренная стратегия': 0,
        'Выраженная стратегия': 0
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
  for (let i = 1; i <= TOTAL_QUESTIONS; i += 1) {
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
  if (!QUADRANTS.includes(quadrant)) return null;

  const safeAnswers = {};
  for (let i = 1; i <= TOTAL_QUESTIONS; i += 1) {
    const value = toInteger(answers[String(i)]);
    if (![1, 2, 3, 4, 5].includes(value)) return null;
    safeAnswers[String(i)] = value;
  }

  const fallbackRaw = calculateRawFromAnswers(safeAnswers);
  const rawX = isFiniteNumber(toInteger(result?.raw?.x))
    ? toInteger(result.raw.x)
    : fallbackRaw.x;
  const rawY = isFiniteNumber(toInteger(result?.raw?.y))
    ? toInteger(result.raw.y)
    : fallbackRaw.y;

  return {
    timestamp: typeof input.timestamp === 'string' ? input.timestamp : new Date().toISOString(),
    result: {
      raw: {
        x: clamp(rawX, -28, 28),
        y: clamp(rawY, -28, 28)
      },
      normalized: { x: clamp(x, -100, 100), y: clamp(y, -100, 100) },
      distance: { percent: clamp(distancePercent, 0, 100) },
      confidence: {
        value: clamp(confidence, 0, 100),
        neutralCount: clamp(neutralCount, 0, TOTAL_QUESTIONS)
      },
      quadrant
    },
    answers: safeAnswers
  };
}

function calculateRawFromAnswers(answers) {
  const sum = (ids) => ids.reduce((total, id) => total + toInteger(answers[String(id)]), 0);

  return {
    x: sum(QUESTION_SCORING.xPositive) - sum(QUESTION_SCORING.xNegative),
    y: sum(QUESTION_SCORING.yPositive) - sum(QUESTION_SCORING.yNegative)
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
    if (db.perQuestion[questionId]) {
      db.perQuestion[questionId][String(value)] += 1;
    }
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
  for (let i = 1; i <= TOTAL_QUESTIONS; i += 1) {
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
    source: supabase ? 'supabase' : 'local',
    submissions: n,
    averages,
    quadrants: db.quadrants,
    bands: db.bands,
    daily: db.daily,
    perQuestion
  };
}

function getXBand(x) {
  if (x >= 35) return 'Сильная открытость';
  if (x >= 10) return 'Умеренная открытость';
  if (x >= -9) return 'Смешанная позиция';
  if (x >= -34) return 'Умеренная стратегия';
  return 'Выраженная стратегия';
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
