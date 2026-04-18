(() => {
  const refs = {
    statusCard: document.getElementById('statusCard'),
    contentCard: document.getElementById('contentCard'),
    quadrantsCard: document.getElementById('quadrantsCard'),
    bandsCard: document.getElementById('bandsCard'),
    questionsCard: document.getElementById('questionsCard'),
    metricsGrid: document.getElementById('metricsGrid'),
    quadrantsBars: document.getElementById('quadrantsBars'),
    xBandsBars: document.getElementById('xBandsBars'),
    yBandsBars: document.getElementById('yBandsBars'),
    distanceBandsBars: document.getElementById('distanceBandsBars'),
    confidenceBandsBars: document.getElementById('confidenceBandsBars'),
    questionsBody: document.getElementById('questionsBody')
  };

  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    try {
      const response = await fetch('/api/analytics/summary');
      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error('bad_response');
      }

      render(data);
    } catch (error) {
      refs.statusCard.innerHTML = '<p class="lead">Не удалось загрузить статистику. Попробуйте позже.</p>';
    }
  }

  function render(data) {
    const n = data.submissions || 0;

    if (n === 0) {
      refs.statusCard.innerHTML = '<p class="lead">Пока нет данных. Статистика появится после первых завершённых прохождений теста.</p>';
      return;
    }

    refs.statusCard.innerHTML = `<p class="lead">Всего обезличенных прохождений: <strong>${n}</strong></p>`;

    refs.metricsGrid.innerHTML = [
      metric('Средний X', data.averages.x),
      metric('Средний Y', data.averages.y),
      metric('Средняя выраженность', `${data.averages.distancePercent}%`),
      metric('Средняя определённость', `${data.averages.confidence}%`),
      metric('Средний нейтральный ответов', data.averages.neutralCount)
    ].join('');

    refs.quadrantsBars.innerHTML = renderBars(data.quadrants, n);
    refs.xBandsBars.innerHTML = renderBars(data.bands.x, n);
    refs.yBandsBars.innerHTML = renderBars(data.bands.y, n);
    refs.distanceBandsBars.innerHTML = renderBars(data.bands.distance, n);
    refs.confidenceBandsBars.innerHTML = renderBars(data.bands.confidence, n);

    refs.questionsBody.innerHTML = window.QUESTIONS.map((q) => {
      const s = data.perQuestion[q.id] || { mean: 0, total: 0 };
      return `
        <tr>
          <td>${q.id}</td>
          <td>${q.text}</td>
          <td>${Number(s.mean || 0).toFixed(2)}</td>
          <td>${s.total || 0}</td>
        </tr>
      `;
    }).join('');

    refs.contentCard.hidden = false;
    refs.quadrantsCard.hidden = false;
    refs.bandsCard.hidden = false;
    refs.questionsCard.hidden = false;
  }

  function metric(label, value) {
    return `<div class="stat-card"><span class="k">${label}</span><strong>${value}</strong></div>`;
  }

  function renderBars(obj, total) {
    return Object.entries(obj).map(([label, count]) => {
      const percent = total > 0 ? Math.round((count / total) * 100) : 0;
      return `
        <div class="bar-row">
          <div class="bar-label">${label}</div>
          <div class="bar-track"><div class="bar-fill" style="width:${percent}%"></div></div>
          <div class="bar-val">${count} (${percent}%)</div>
        </div>
      `;
    }).join('');
  }
})();
