(() => {
  const TOTAL_QUESTIONS = 24;
  const STORAGE_KEYS = {
    answers: 'relationships_views_answers_v1',
    result: 'relationships_views_result_v1'
  };
  const STORAGE = window.sessionStorage;

  const RESPONSE_OPTIONS = [
    { value: 1, label: 'Полностью не согласен' },
    { value: 2, label: 'Скорее не согласен' },
    { value: 3, label: 'Нейтрально / зависит' },
    { value: 4, label: 'Скорее согласен' },
    { value: 5, label: 'Полностью согласен' }
  ];

  const QUADRANT_META = {
    'Гибкое партнёрство': {
      description: 'Фокус на диалоге, координации интересов и возможности менять формат отношений через осознанные действия.',
      risk: 'Радикальная крайность в этой зоне может уходить в наивный оптимизм и недооценку реальных ограничений.'
    },
    'Стратегическая конкуренция': {
      description: 'Отношения воспринимаются как стратегическая среда, где важны контроль, ресурсы и управляемость взаимодействия.',
      risk: 'Радикальная крайность здесь часто выражается в жёстком цинизме и недоверии к любым кооперативным сценариям.'
    },
    'Структурированное партнёрство': {
      description: 'Упор на устойчивые роли и правила, при которых партнёрство строится через структурированную модель взаимодействия.',
      risk: 'Радикальная крайность может приводить к догматизму и снижению гибкости в нестандартных жизненных ситуациях.'
    },
    'Фиксированная конкуренция': {
      description: 'Сочетание конкуренции и фиксированности, где исход отношений воспринимается как в основном предопределённый.',
      risk: 'Радикальная крайность может переходить в нигилистичную позицию с отказом от конструктивных изменений.'
    }
  };

  const refs = {};
  let currentResult = null;

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    cacheElements();
    renderQuestions();
    bindEvents();
    restoreState();
    updateProgress();
  }

  function cacheElements() {
    refs.form = document.getElementById('testForm');
    refs.questionsContainer = document.getElementById('questionsContainer');
    refs.calculateBtn = document.getElementById('calculateBtn');
    refs.resetBtn = document.getElementById('resetBtn');
    refs.progressText = document.getElementById('progressText');
    refs.progressFill = document.getElementById('progressFill');
    refs.validationMessage = document.getElementById('validationMessage');
    refs.resultSection = document.getElementById('resultSection');
    refs.rawCoords = document.getElementById('rawCoords');
    refs.normCoords = document.getElementById('normCoords');
    refs.quadrantValue = document.getElementById('quadrantValue');
    refs.distanceValue = document.getElementById('distanceValue');
    refs.confidenceValue = document.getElementById('confidenceValue');
    refs.summaryText = document.getElementById('summaryText');
    refs.userPoint = document.getElementById('userPoint');
    refs.copyBtn = document.getElementById('copyBtn');
    refs.downloadBtn = document.getElementById('downloadBtn');
    refs.copyMessage = document.getElementById('copyMessage');
  }

  function renderQuestions() {
    const html = window.QUESTIONS.map((question) => {
      const options = RESPONSE_OPTIONS.map((option) => `
        <label class="option">
          <input type="radio" name="q-${question.id}" value="${option.value}" />
          <span>${option.label}</span>
        </label>
      `).join('');

      return `
        <article class="question-card" data-question-id="${question.id}">
          <div class="question-top">
            <span class="question-id">${question.id}</span>
            <p class="question-text">${question.text}</p>
          </div>
          <div class="options">${options}</div>
        </article>
      `;
    }).join('');

    refs.questionsContainer.innerHTML = html;
  }

  function bindEvents() {
    refs.questionsContainer.addEventListener('change', (event) => {
      if (!(event.target instanceof HTMLInputElement)) {
        return;
      }

      if (!event.target.name.startsWith('q-')) {
        return;
      }

      const questionId = Number(event.target.name.replace('q-', ''));
      clearMissingForQuestion(questionId);
      hideValidation();
      saveAnswers();
      updateProgress();
    });

    refs.calculateBtn.addEventListener('click', onCalculate);
    refs.resetBtn.addEventListener('click', onReset);
    refs.copyBtn.addEventListener('click', onCopyResult);
    refs.downloadBtn.addEventListener('click', onDownloadResult);
  }

  function restoreState() {
    const storedAnswers = parseStorage(STORAGE_KEYS.answers);
    if (storedAnswers && typeof storedAnswers === 'object') {
      Object.entries(storedAnswers).forEach(([questionId, value]) => {
        const input = refs.form.querySelector(`input[name="q-${questionId}"][value="${value}"]`);
        if (input) {
          input.checked = true;
        }
      });

      const answeredCount = Object.keys(storedAnswers).length;
      if (answeredCount === TOTAL_QUESTIONS) {
        // Rebuild result from answers to avoid stale summary text after logic updates.
        currentResult = calculateResult(storedAnswers);
        STORAGE.setItem(STORAGE_KEYS.result, JSON.stringify(currentResult));
        renderResult(currentResult);
        return;
      }
    }

    const storedResult = parseStorage(STORAGE_KEYS.result);
    if (storedResult && typeof storedResult === 'object') {
      currentResult = storedResult;
      renderResult(currentResult);
    }
  }

  function parseStorage(key) {
    try {
      const raw = STORAGE.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      return null;
    }
  }

  function collectAnswers() {
    const answers = {};
    const missingIds = [];

    for (const question of window.QUESTIONS) {
      const selected = refs.form.querySelector(`input[name="q-${question.id}"]:checked`);
      if (!selected) {
        missingIds.push(question.id);
      } else {
        answers[question.id] = Number(selected.value);
      }
    }

    return { answers, missingIds };
  }

  function onCalculate() {
    const { answers, missingIds } = collectAnswers();

    if (missingIds.length > 0) {
      showValidation(`Ответьте на все вопросы. Пропущено: ${missingIds.length}.`);
      markMissingQuestions(missingIds);
      scrollToFirstMissing(missingIds[0]);
      return;
    }

    hideValidation();
    markMissingQuestions([]);

    const result = calculateResult(answers);
    currentResult = result;

    STORAGE.setItem(STORAGE_KEYS.answers, JSON.stringify(answers));
    STORAGE.setItem(STORAGE_KEYS.result, JSON.stringify(result));
    sendAnalytics(result, answers);

    renderResult(result);
    refs.resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function calculateResult(answers) {
    const sums = {
      xPositive: 0,
      xNegative: 0,
      yPositive: 0,
      yNegative: 0
    };

    let neutralCount = 0;

    for (const question of window.QUESTIONS) {
      const value = Number(answers[question.id]);

      if (value === 3) {
        neutralCount += 1;
      }

      if (question.axis === 'X' && question.pole === 'positive') sums.xPositive += value;
      if (question.axis === 'X' && question.pole === 'negative') sums.xNegative += value;
      if (question.axis === 'Y' && question.pole === 'positive') sums.yPositive += value;
      if (question.axis === 'Y' && question.pole === 'negative') sums.yNegative += value;
    }

    const xRaw = sums.xPositive - sums.xNegative;
    const yRaw = sums.yPositive - sums.yNegative;

    const xNorm = normalizeX(xRaw);
    const yNorm = normalizeY(yRaw);

    const distanceRaw = Math.sqrt((xNorm ** 2) + (yNorm ** 2));
    const distanceMax = Math.sqrt((100 ** 2) + (100 ** 2));
    const distancePercent = clamp(Math.round((distanceRaw / distanceMax) * 100), 0, 100);

    const confidenceValue = clamp(Math.round(100 - ((neutralCount / TOTAL_QUESTIONS) * 100)), 0, 100);

    const result = {
      answers,
      raw: { x: xRaw, y: yRaw },
      normalized: { x: xNorm, y: yNorm },
      quadrant: getQuadrant(xNorm, yNorm),
      distance: {
        raw: Number(distanceRaw.toFixed(2)),
        percent: distancePercent,
        label: getDistanceLabel(distancePercent)
      },
      confidence: {
        value: confidenceValue,
        label: getConfidenceLabel(confidenceValue),
        neutralCount
      },
      summary: ''
    };

    result.summary = generateSummary(result);
    return result;
  }

  function normalizeX(xRaw) {
    return Math.round((((xRaw + 24) / 48) * 200) - 100);
  }

  function normalizeY(yRaw) {
    return Math.round((((yRaw + 18) / 48) * 200) - 100);
  }

  function getQuadrant(x, y) {
    if (x >= 0 && y >= 0) return 'Гибкое партнёрство';
    if (x < 0 && y >= 0) return 'Стратегическая конкуренция';
    if (x >= 0 && y < 0) return 'Структурированное партнёрство';
    return 'Фиксированная конкуренция';
  }

  function getDistanceLabel(distancePercent) {
    if (distancePercent <= 19) return 'очень умеренная позиция';
    if (distancePercent <= 39) return 'умеренная позиция';
    if (distancePercent <= 59) return 'выраженная позиция';
    if (distancePercent <= 79) return 'сильная позиция';
    return 'очень сильная позиция';
  }

  function getConfidenceLabel(value) {
    if (value >= 80) return 'высокая определённость';
    if (value >= 60) return 'умеренная определённость';
    if (value >= 40) return 'смешанная определённость';
    return 'низкая определённость';
  }

  function getAxisXProfile(x) {
    if (x >= 35) {
      return {
        label: 'выраженный сдвиг к партнёрству',
        text: 'В вашем взгляде отношения чаще выглядят как пространство координации интересов, переговоров и совместной настройки правил, а не как постоянное соревнование за контроль.'
      };
    }

    if (x >= 10) {
      return {
        label: 'умеренный сдвиг к партнёрству',
        text: 'Вы чаще выбираете партнёрский подход, но без иллюзии полной гармонии: конкуренция и борьба за позицию для вас тоже остаются реальными факторами.'
      };
    }

    if (x >= -9) {
      return {
        label: 'смешанная позиция',
        text: 'По оси партнёрство/конкуренция у вас сбалансированный взгляд: в одних контекстах вы опираетесь на согласование, в других допускаете более жёсткую стратегию.'
      };
    }

    if (x >= -34) {
      return {
        label: 'умеренный сдвиг к конкуренции',
        text: 'Вы скорее видите отношения как среду, где важны влияние, рамки и контроль динамики, хотя полностью не исключаете роль договорённостей и взаимной кооперации.'
      };
    }

    return {
      label: 'выраженный сдвиг к конкуренции',
      text: 'Ваш профиль по оси X подчёркивает стратегический и конкурентный взгляд: устойчивость чаще связывается с управлением позицией, чем с взаимной открытостью.'
    };
  }

  function getAxisYProfile(y) {
    if (y >= 35) {
      return {
        label: 'выраженный сдвиг к агентности',
        text: 'Вы в большей степени считаете, что действия, навыки и поведенческие изменения реально способны заметно менять исход взаимодействия.'
      };
    }

    if (y >= 10) {
      return {
        label: 'умеренный сдвиг к агентности',
        text: 'Вы скорее верите в возможность изменений через работу над собой и коммуникацией, хотя признаёте, что часть ограничений задаётся контекстом.'
      };
    }

    if (y >= -9) {
      return {
        label: 'смешанная позиция',
        text: 'По оси агентность/детерминизм у вас промежуточная позиция: часть факторов вы считаете управляемыми, а часть — относительно заданными.'
      };
    }

    if (y >= -34) {
      return {
        label: 'умеренный сдвиг к детерминизму',
        text: 'Вы чаще подчеркиваете роль исходных ограничений (стартовых условий, среды, статуса), но не сводите всё к полной предопределённости.'
      };
    }

    return {
      label: 'выраженный сдвиг к детерминизму',
      text: 'Ваш взгляд по оси Y ближе к детерминизму: даже серьёзные усилия вы чаще воспринимаете как ограниченные рамками исходных условий.'
    };
  }

  function generateSummary(result) {
    const xProfile = getAxisXProfile(result.normalized.x);
    const yProfile = getAxisYProfile(result.normalized.y);
    const meta = QUADRANT_META[result.quadrant];

    const paragraphs = [
      `Ваш текущий профиль попадает в квадрант «${result.quadrant}». ${meta ? meta.description : ''}`,
      `По оси X (партнёрство ↔ конкуренция): ${xProfile.label}. ${xProfile.text}`,
      `По оси Y (агентность ↔ детерминизм): ${yProfile.label}. ${yProfile.text}`,
      `Выраженность позиции — ${result.distance.percent}% (${result.distance.label}). Это показывает, насколько последовательно ваши ответы смещены от центра смешанной позиции.`,
      `Определённость ответов — ${result.confidence.value}% (${result.confidence.label}).`,
      `Координаты профиля: X=${result.normalized.x}, Y=${result.normalized.y}.`,
      meta ? `${meta.risk}` : ''
    ];

    if (result.confidence.value < 40) {
      paragraphs.push('Вы часто выбирали нейтральный вариант ответа, поэтому итог лучше трактовать осторожно: профиль может отражать скорее неопределённость в формулировках, чем устойчивую позицию.');
    } else if (result.confidence.value < 60) {
      paragraphs.push('В ответах заметна доля нейтральных оценок, поэтому результат лучше читать как ориентировочный профиль, а не как жёстко фиксированную позицию.');
    }

    paragraphs.push('Интерпретация результата является ориентировочным самоописанием взглядов и не является диагнозом или научной психодиагностикой.');

    return paragraphs.filter(Boolean).join('\n\n');
  }

  function renderResult(result) {
    refs.resultSection.hidden = false;
    refs.rawCoords.textContent = `${result.raw.x} / ${result.raw.y}`;
    refs.normCoords.textContent = `${result.normalized.x} / ${result.normalized.y}`;
    refs.quadrantValue.textContent = result.quadrant;
    refs.distanceValue.textContent = `${result.distance.percent}% (${result.distance.label})`;
    refs.confidenceValue.textContent = `${result.confidence.value}% (${result.confidence.label}, нейтральных: ${result.confidence.neutralCount})`;

    renderSummary(result.summary);
    placeUserPoint(result.normalized.x, result.normalized.y);
  }

  function renderSummary(summary) {
    refs.summaryText.innerHTML = '';
    const paragraphs = summary.split('\n\n').filter(Boolean);

    for (const text of paragraphs) {
      const p = document.createElement('p');
      p.textContent = text;
      refs.summaryText.appendChild(p);
    }
  }

  function placeUserPoint(xNorm, yNorm) {
    // По правилу квадрантов положительный X = партнёрство (визуально слева), поэтому X инвертируется.
    const left = 50 - (xNorm / 2);
    const top = 50 - (yNorm / 2);

    refs.userPoint.style.left = `${clamp(left, 0, 100)}%`;
    refs.userPoint.style.top = `${clamp(top, 0, 100)}%`;
  }

  function onReset() {
    refs.form.reset();
    hideValidation();
    markMissingQuestions([]);

    refs.resultSection.hidden = true;
    refs.summaryText.innerHTML = '';
    refs.copyMessage.textContent = '';

    currentResult = null;
    STORAGE.removeItem(STORAGE_KEYS.answers);
    STORAGE.removeItem(STORAGE_KEYS.result);

    updateProgress();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function onCopyResult() {
    if (!currentResult) {
      refs.copyMessage.textContent = 'Сначала рассчитайте результат.';
      return;
    }

    const text = [
      `X: ${currentResult.normalized.x}`,
      `Y: ${currentResult.normalized.y}`,
      `Квадрант: ${currentResult.quadrant}`,
      `Выраженность: ${currentResult.distance.percent}% (${currentResult.distance.label})`,
      `Определённость: ${currentResult.confidence.value}% (${currentResult.confidence.label})`
    ].join(' | ');

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        fallbackCopy(text);
      }
      refs.copyMessage.textContent = 'Краткий результат скопирован.';
    } catch (error) {
      fallbackCopy(text);
      refs.copyMessage.textContent = 'Краткий результат скопирован.';
    }
  }

  function fallbackCopy(text) {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', 'readonly');
    area.style.position = 'absolute';
    area.style.left = '-9999px';
    document.body.appendChild(area);
    area.select();
    document.execCommand('copy');
    document.body.removeChild(area);
  }

  function onDownloadResult() {
    if (!currentResult) {
      refs.copyMessage.textContent = 'Сначала рассчитайте результат.';
      return;
    }

    const json = JSON.stringify(currentResult, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'relationship-result.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function saveAnswers() {
    const { answers } = collectAnswers();
    STORAGE.setItem(STORAGE_KEYS.answers, JSON.stringify(answers));
  }

  function updateProgress() {
    let answered = 0;

    for (const question of window.QUESTIONS) {
      if (refs.form.querySelector(`input[name="q-${question.id}"]:checked`)) {
        answered += 1;
      }
    }

    const percent = Math.round((answered / TOTAL_QUESTIONS) * 100);
    refs.progressText.textContent = `${answered} / ${TOTAL_QUESTIONS}`;
    refs.progressFill.style.width = `${percent}%`;
  }

  function markMissingQuestions(missingIds) {
    const missing = new Set(missingIds);

    for (const question of window.QUESTIONS) {
      const card = refs.questionsContainer.querySelector(`[data-question-id="${question.id}"]`);
      if (!card) continue;

      if (missing.has(question.id)) {
        card.classList.add('question-card--missing');
      } else {
        card.classList.remove('question-card--missing');
      }
    }
  }

  function clearMissingForQuestion(questionId) {
    const card = refs.questionsContainer.querySelector(`[data-question-id="${questionId}"]`);
    if (card) {
      card.classList.remove('question-card--missing');
    }
  }

  function scrollToFirstMissing(questionId) {
    const firstMissing = refs.questionsContainer.querySelector(`[data-question-id="${questionId}"]`);
    if (firstMissing) {
      firstMissing.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  function showValidation(text) {
    refs.validationMessage.hidden = false;
    refs.validationMessage.textContent = text;
  }

  function hideValidation() {
    refs.validationMessage.hidden = true;
    refs.validationMessage.textContent = '';
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function sendAnalytics(result, answers) {
    const payload = {
      timestamp: new Date().toISOString(),
      result: {
        normalized: result.normalized,
        quadrant: result.quadrant,
        distance: { percent: result.distance.percent },
        confidence: {
          value: result.confidence.value,
          neutralCount: result.confidence.neutralCount
        }
      },
      answers
    };

    const body = JSON.stringify(payload);

    // sendBeacon is non-blocking and does not affect UX on slow networks.
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: 'application/json' });
      navigator.sendBeacon('/api/analytics/result', blob);
      return;
    }

    fetch('/api/analytics/result', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body
    }).catch(() => {});
  }
})();
