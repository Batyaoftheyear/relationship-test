(() => {
  const TOTAL_QUESTIONS = 28;
  const STORAGE_KEYS = {
    answers: 'relationships_views_answers_v2',
    result: 'relationships_views_result_v2'
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
      description: 'Фокус на прямом разговоре, доверии и возможности менять формат отношений через осознанные действия.',
      risk: 'Радикальная крайность в этой зоне может уходить в наивный оптимизм и недооценку реальных ограничений.'
    },
    'Стратегическая конкуренция': {
      description: 'Отношения воспринимаются как стратегическая среда, где важны контроль, ресурсы и управляемость взаимодействия.',
      risk: 'Радикальная крайность здесь часто выражается в жёстком цинизме и недоверии к любым кооперативным сценариям.'
    },
    'Структурированное партнёрство': {
      description: 'Упор на устойчивые роли и правила, при которых открытость строится внутри структурированной модели взаимодействия.',
      risk: 'Радикальная крайность может приводить к догматизму и снижению гибкости в нестандартных жизненных ситуациях.'
    },
    'Фиксированная конкуренция': {
      description: 'Сочетание стратегии и детерминизма, где исход отношений воспринимается как в основном предопределённый.',
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
    return Math.round((xRaw / 28) * 100);
  }

  function normalizeY(yRaw) {
    return Math.round((yRaw / 28) * 100);
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
    if (value >= 40) return 'смешанная / осторожная позиция';
    return 'низкая определённость';
  }

  function getAxisXProfile(x) {
    if (x >= 35) {
      return {
        label: 'выраженный сдвиг к открытости',
        meaning: 'Вы скорее воспринимаете отношения как пространство прямого разговора, ясных намерений, доверия и договорённостей.',
        nuance: 'Конфликты в такой картине не исчезают, но решаются не через игру позиций, а через обсуждение условий, границ и ответственности.'
      };
    }

    if (x >= 10) {
      return {
        label: 'умеренный сдвиг к открытости',
        meaning: 'Вам ближе логика прямого общения, где важны доверие, разговор и понятные намерения.',
        nuance: 'При этом результат не выглядит наивным: вы, вероятно, допускаете, что в отношениях бывают сигналы, интересы и неравномерное распределение влияния.'
      };
    }

    if (x >= -9) {
      return {
        label: 'смешанная позиция',
        meaning: 'Вы не занимаете жёстко открытую или жёстко стратегическую позицию.',
        nuance: 'Скорее вы различаете ситуации: где-то уместны прямой разговор и договорённости, а где-то нужны осторожность, чтение сигналов и понимание интересов сторон.'
      };
    }

    if (x >= -34) {
      return {
        label: 'умеренный сдвиг к стратегии',
        meaning: 'Вы чаще смотрите на отношения как на среду, где важно читать сигналы, видеть интересы сторон и понимать динамику взаимодействия.',
        nuance: 'Это не обязательно означает отказ от близости или договорённостей, но открытый разговор для вас, вероятно, не является достаточным основанием сам по себе.'
      };
    }

    return {
      label: 'выраженный сдвиг к стратегии',
      meaning: 'Вы склонны видеть отношения через призму сигналов, фактического поведения, баланса влияния и скрытых правил взаимодействия.',
      nuance: 'В такой картине устойчивость чаще зависит от умения читать динамику и не терять позицию, чем от открытого согласования намерений.'
    };
  }

  function getAxisYProfile(y) {
    if (y >= 35) {
      return {
        label: 'выраженный сдвиг к агентности',
        meaning: 'Вы явно придаёте большое значение действиям человека: навыкам общения, поведению, способности учиться и менять стратегию.',
        nuance: 'Исходные данные, статус и среда могут иметь значение, но в вашей картине они не закрывают возможность заметного изменения результата.'
      };
    }

    if (y >= 10) {
      return {
        label: 'умеренный сдвиг к агентности',
        meaning: 'Вы скорее считаете, что результаты в знакомстве и отношениях можно улучшать через поведение, коммуникацию и работу над собой.',
        nuance: 'При этом позиция не выглядит радикальной: ограничения внешности, статуса, среды и уже сложившегося положения для вас тоже остаются значимыми.'
      };
    }

    if (y >= -9) {
      return {
        label: 'смешанная позиция',
        meaning: 'Вы не сводите результат ни только к личным усилиям, ни только к исходным ограничениям.',
        nuance: 'Скорее вы видите сочетание управляемых факторов и заданных условий: где-то помогает развитие навыков, а где-то рамки среды действительно ограничивают выбор.'
      };
    }

    if (y >= -34) {
      return {
        label: 'умеренный сдвиг к детерминизму',
        meaning: 'Вы чаще подчёркиваете роль уже сложившихся условий: внешности, статуса, положения, среды и устойчивых социальных ожиданий.',
        nuance: 'При этом результат не говорит о полном фатализме: усилия и изменения могут иметь смысл, но, по вашему взгляду, они работают внутри заметных ограничений.'
      };
    }

    return {
      label: 'выраженный сдвиг к детерминизму',
      meaning: 'Вы склонны считать, что исходные условия сильно задают возможный диапазон результата в знакомстве и отношениях.',
      nuance: 'В такой картине усилия, навыки и коммуникация могут что-то менять, но не отменяют потолок, связанный с привлекательностью, статусом, средой и устойчивыми ролями.'
    };
  }

  function getQuadrantProfile(result, xProfile, yProfile) {
    const quadrant = result.quadrant;
    const descriptions = {
      'Гибкое партнёрство': getFlexiblePartnershipProfile(result),
      'Стратегическая конкуренция': `Ваш результат ближе к стратегической конкуренции. В этой позиции взаимодействие мужчины и женщины чаще выглядит как среда сигналов, статуса и влияния, но при этом человек всё ещё может менять результат через навыки, стратегию и поведение. ${getCenterNuance(result)}`,
      'Структурированное партнёрство': `Ваш результат ближе к структурированному партнёрству. В этой позиции отношения скорее строятся через договорённости и взаимный учёт, но с признанием устойчивых ролей, ограничений и неравных стартовых условий. ${getCenterNuance(result)}`,
      'Фиксированная конкуренция': `Ваш результат ближе к фиксированной конкуренции. В этой позиции отношения чаще воспринимаются как стратегическая среда, где многое задаётся исходными условиями, статусом, привлекательностью и распределением влияния. ${getCenterNuance(result)}`
    };

    return descriptions[quadrant] || `Ваш результат относится к квадранту «${quadrant}». ${xProfile.label}, ${yProfile.label}.`;
  }

  function getFlexiblePartnershipProfile(result) {
    const centerNuance = getCenterNuance(result);

    if (result.normalized.x >= 35 && result.normalized.y >= 35) {
      return `Ваш результат ближе к выраженному гибкому партнёрству. Вы скорее видите отношения как живой союз двух людей, где важны честный разговор, доверие, уважение границ и готовность меняться. Для вас отношения — это не фиксированная схема и не игра за контроль, а пространство, которое можно выстраивать вместе. Сильная сторона такого взгляда — гибкость, способность договариваться и не превращать разногласия в борьбу. Возможный риск — иногда недооценивать скрытые мотивы, неравенство позиций или ситуации, где одного разговора действительно мало. ${centerNuance}`;
    }

    if (result.normalized.x >= 10 && result.normalized.y >= 10) {
      return `Ваш результат ближе к гибкому партнёрству. Вы скорее видите отношения как живой союз двух людей, где важны честный разговор, доверие, уважение границ и готовность меняться. Для вас отношения — это не фиксированная схема и не игра за контроль, а пространство, которое можно выстраивать вместе. Сильная сторона такого взгляда — гибкость, способность договариваться и не превращать разногласия в борьбу. Возможный риск — иногда недооценивать скрытые мотивы, неравенство позиций или ситуации, где одного разговора действительно мало. ${centerNuance}`;
    }

    if (result.normalized.x >= 10) {
      return `Ваш результат попадает в зону гибкого партнёрства главным образом за счёт открытого взгляда на горизонтальной оси. Вы скорее не сводите отношения к стратегии и контролю динамики: для вас важны доверие, прямой разговор и возможность договариваться. При этом по вертикальной оси позиция ближе к центру, поэтому акцент на агентности не выглядит безусловным: исходные данные, статус и среда тоже могут восприниматься как значимые ограничения. ${centerNuance}`;
    }

    if (result.normalized.y >= 10) {
      return `Ваш результат попадает в зону гибкого партнёрства главным образом за счёт сдвига к агентности. Вы скорее считаете, что поведение, навыки общения и готовность менять стратегию способны улучшать динамику знакомства и отношений. При этом по горизонтальной оси позиция близка к центру: вы не полностью исключаете сигналы, интересы сторон и необходимость держать рамки, но не делаете их главным объяснением отношений. ${centerNuance}`;
    }

    return `Ваш результат формально относится к гибкому партнёрству, но находится близко к центру. Это скорее мягкий уклон, чем жёсткая позиция: вы допускаете ценность прямого разговора, доверия и личного влияния на ситуацию, но, вероятно, сильно учитываете контекст конкретного человека, стадии знакомства и распределения интересов. ${centerNuance}`;
  }

  function getCenterNuance(result) {
    if (result.distance.percent <= 19) {
      return 'При этом профиль расположен близко к центру, поэтому речь идёт не о жёсткой позиции, а о слабом смещении в эту сторону.';
    }

    if (result.distance.percent <= 39) {
      return 'Смещение заметно, но остаётся умеренным: это больше рабочий уклон во взглядах, чем жёсткая идеологическая позиция.';
    }

    return 'Смещение достаточно заметное, поэтому этот квадрант можно читать как важную часть вашей текущей картины отношений.';
  }

  function getDistanceComment(distance) {
    if (distance.percent <= 19) {
      return `Общая выраженность позиции очень умеренная: ответы остаются близко к центру, поэтому результат лучше читать как гибкий и контекстный профиль.`;
    }

    if (distance.percent <= 39) {
      return `Общая выраженность позиции умеренная: у результата есть направление, но без сильного ухода в крайние значения.`;
    }

    if (distance.percent <= 59) {
      return `Общая выраженность позиции заметная: ответы складываются в достаточно оформленный взгляд, а не в случайный набор оценок.`;
    }

    if (distance.percent <= 79) {
      return `Общая выраженность позиции сильная: ваши ответы последовательно поддерживают один тип интерпретации отношений.`;
    }

    return `Общая выраженность позиции очень сильная: профиль находится близко к краям модели, поэтому важно помнить, что реальное поведение людей часто сложнее любой схемы.`;
  }

  function getConfidenceComment(confidence) {
    if (confidence.value >= 80) {
      return `Определённость ответов высокая. Вы редко выбирали нейтральный вариант, поэтому результат можно читать как довольно устойчивое описание выбранной позиции.`;
    }

    if (confidence.value >= 60) {
      return `Определённость ответов умеренная. В целом позиция считывается, но часть утверждений, вероятно, зависела для вас от контекста.`;
    }

    if (confidence.value >= 40) {
      return `Определённость ответов смешанная. Нейтральных ответов достаточно много, поэтому результат показывает скорее направление размышлений, чем твёрдо оформленную позицию.`;
    }

    return `Определённость ответов низкая. Вы часто выбирали нейтральный вариант, поэтому итог стоит трактовать осторожно: он может отражать неустойчивость позиции, спорность формулировок или зависимость ответов от конкретной ситуации.`;
  }

  function generateSummary(result) {
    const xProfile = getAxisXProfile(result.normalized.x);
    const yProfile = getAxisYProfile(result.normalized.y);
    const meta = QUADRANT_META[result.quadrant];

    const paragraphs = [
      getQuadrantProfile(result, xProfile, yProfile),
      `По горизонтальной оси у вас ${xProfile.label}. ${xProfile.meaning} ${xProfile.nuance}`,
      `По вертикальной оси у вас ${yProfile.label}. ${yProfile.meaning} ${yProfile.nuance}`,
      getDistanceComment(result.distance),
      getConfidenceComment(result.confidence)
    ];

    if (meta && result.distance.percent >= 60) {
      paragraphs.push(meta.risk);
    }

    paragraphs.push(`Технически: X=${result.normalized.x}, Y=${result.normalized.y}, выраженность ${result.distance.percent}%, определённость ${result.confidence.value}%.`);
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
    // По правилу квадрантов положительный X = открытость (визуально слева), поэтому X инвертируется.
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
        raw: result.raw,
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

    fetch('/api/result', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true
    }).then((response) => {
      if (!response.ok) throw new Error('analytics_failed');
    }).catch(() => {
      if (navigator.sendBeacon) {
        const blob = new Blob([body], { type: 'application/json' });
        navigator.sendBeacon('/api/result', blob);
      }
    });
  }
})();
