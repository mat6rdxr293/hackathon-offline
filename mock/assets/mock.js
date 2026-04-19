const showToast = (() => {
  let timer;
  return (message) => {
    let el = document.getElementById('toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(timer);
    timer = window.setTimeout(() => el.classList.remove('show'), 2200);
  };
})();

document.addEventListener('DOMContentLoaded', () => {
  // Tab navigation
  const tabButtons = Array.from(document.querySelectorAll('[data-tab]'));
  const sections = Array.from(document.querySelectorAll('[data-section]'));

  const setActiveTab = (target) => {
    tabButtons.forEach((btn) => {
      btn.classList.toggle('is-active', btn.getAttribute('data-tab') === target);
    });

    sections.forEach((sec) => {
      sec.classList.toggle('is-active', sec.getAttribute('data-section') === target);
    });

    const pageTypeMap = {
      overview: 'patient_page',
      primary_exam: 'primary_exam',
      discharge_summary: 'discharge_summary',
      treatment_diary: 'treatment_diary',
      procedures: 'procedures',
      schedule_block: 'schedule_block',
    };

    document.body.setAttribute('data-page-type', pageTypeMap[target] || 'patient_page');
  };

  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-tab');
      if (target) {
        setActiveTab(target);
      }
    });
  });

  const defaultTab = tabButtons.find((b) => b.classList.contains('is-active'))?.getAttribute('data-tab');
  if (defaultTab) {
    setActiveTab(defaultTab);
  }

  // Save buttons
  document.querySelectorAll('[data-action="save-form"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.getAttribute('data-toast-target') || 'Страница';
      showToast(`✓ ${target} сохранено`);

      const originalText = btn.textContent;
      btn.textContent = 'Сохранено ✓';
      btn.classList.remove('primary');
      btn.classList.add('success');

      const note = document.getElementById('save-note');
      if (note) {
        note.textContent = `Сохранено в ${new Date().toLocaleTimeString('ru-RU')}`;
      }

      window.setTimeout(() => {
        btn.textContent = originalText;
        btn.classList.add('primary');
        btn.classList.remove('success');
      }, 1500);
    });
  });

  // Procedures: mark complete
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action="complete-service"]');
    if (!btn) {
      return;
    }

    const row = btn.closest('tr');
    if (!row) {
      return;
    }

    const titleCell = row.querySelector('[data-col="title"]');
    const statusCell = row.querySelector('[data-col="status"]');
    const title = titleCell?.textContent?.trim() || 'Услуга';

    if (statusCell) {
      statusCell.innerHTML = '<span class="status-pill status-done">Выполнено</span>';
    }

    btn.setAttribute('disabled', 'true');
    btn.textContent = 'Готово';
    showToast(`✓ ${title} отмечено выполненным`);
  });

  // Schedule checkboxes
  const scheduleCheckboxes = Array.from(document.querySelectorAll('.schedule-check'));
  const scheduleDoneCount = document.getElementById('schedule-done-count');
  const totalSessions = scheduleCheckboxes.length;

  const updateScheduleCount = () => {
    const done = scheduleCheckboxes.filter((cb) => cb.checked).length;

    if (scheduleDoneCount) {
      scheduleDoneCount.textContent = `${done} / ${totalSessions} выполнено`;
    }

    if (done === totalSessions && totalSessions > 0) {
      scheduleDoneCount?.classList.add('schedule-progress-badge--done');
    } else {
      scheduleDoneCount?.classList.remove('schedule-progress-badge--done');
    }
  };

  scheduleCheckboxes.forEach((cb) => {
    cb.addEventListener('change', () => {
      const row = cb.closest('tr');
      if (cb.checked) {
        row?.classList.add('schedule-row--done');
        showToast('✓ Занятие отмечено выполненным');
      } else {
        row?.classList.remove('schedule-row--done');
      }
      updateScheduleCount();
    });
  });

  updateScheduleCount();

  // Diary: add entry
  const diarySubmit = document.querySelector('[data-action="add-diary-note"]');
  if (diarySubmit) {
    diarySubmit.addEventListener('click', () => {
      const diaryField = document.querySelector('[data-field="diary-note"]');
      const value = diaryField?.value?.trim();
      if (!value) {
        return;
      }

      const dateInput = document.getElementById('dtRegDateTime');
      const timestamp = dateInput?.value
        ? new Date(dateInput.value).toLocaleString('ru-RU')
        : new Date().toLocaleString('ru-RU');

      const vitalIds = ['ntbTemperature', 'ntbPulse', 'ntbTopPressure', 'ntbBottomPressure', 'ntbBreath', 'ntbSaturation', 'ntbWeight'];
      const vitalLabels = ['Темп.', 'Пульс', 'АД сист.', 'АД диаст.', 'ЧДД', 'SpO2', 'Вес'];
      const vitalsText = vitalIds
        .map((id, i) => {
          const v = document.getElementById(id)?.value?.trim();
          return v ? `${vitalLabels[i]}: ${v}` : '';
        })
        .filter(Boolean)
        .join(' · ');

      const tbody = document.getElementById('diary-history-tbody');
      if (tbody) {
        document.getElementById('diary-history-empty')?.remove();
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td style="white-space:nowrap;color:var(--c-text-3);font-size:11px;">${timestamp}</td>
          <td>${value}</td>
          <td style="white-space:nowrap;font-size:11px;color:var(--c-text-3);">${vitalsText || '—'}</td>`;
        tbody.insertBefore(tr, tbody.firstChild);
      }

      const output = document.getElementById('diary-preview');
      if (output) {
        output.style.display = 'block';
        output.innerHTML = `<strong>${timestamp}</strong> — ${value}${vitalsText ? ` (${vitalsText})` : ''}`;
      }

      if (diaryField) {
        diaryField.value = '';
      }

      vitalIds.forEach((id) => {
        const el = document.getElementById(id);
        if (el) {
          el.value = '';
        }
      });

      showToast('✓ Запись добавлена в дневник');
    });
  }

  const escapeHtml = (value = '') => value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

  const getFirstText = (selectors) => {
    for (const selector of selectors) {
      const value = document.querySelector(selector)?.textContent?.trim();
      if (value) {
        return value;
      }
    }
    return '';
  };

  const extractRowValue = (needle) => {
    const rows = Array.from(document.querySelectorAll('.patient-info-row'));
    const lowerNeedle = needle.toLowerCase();
    for (const row of rows) {
      const label = row.querySelector('.patient-info-label')?.textContent?.trim().toLowerCase() || '';
      if (label.includes(lowerNeedle)) {
        return row.querySelector('.patient-info-value')?.textContent?.trim() || '';
      }
    }
    return '';
  };

  const toSectionBodyHtml = (value) => {
    const text = value.trim();
    if (!text) {
      return '<p class="doc-empty">Не заполнено.</p>';
    }

    return text
      .split(/\n{2,}/)
      .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`)
      .join('');
  };

  const toCompactDateTime = (iso) => {
    if (!iso) {
      return '';
    }
    const parsed = new Date(iso);
    if (Number.isNaN(parsed.getTime())) {
      return '';
    }
    return parsed.toLocaleString('ru-RU', { dateStyle: 'long', timeStyle: 'short' });
  };

  const normalizeForFileName = (value) => {
    const safe = value
      .replace(/[\\/:*?"<>|]/g, '_')
      .replace(/\s+/g, '_')
      .slice(0, 80);
    return safe || 'med_doc';
  };

  const extractPatientContext = () => {
    const patientNameCandidates = [
      getFirstText(['.patient-info-card-name']),
      getFirstText(['.patient-name'])
        .replace(/^№\d+\s*/u, '')
        .replace(/\s+\d{2}\.\d{2}\.\d{4}.*$/u, '')
        .trim(),
      getFirstText(['.standalone-back .small-note']).split('·')[0]?.trim() || '',
    ];

    const patientName = patientNameCandidates.find(Boolean) || 'Пациент';

    const standaloneMeta = getFirstText(['.standalone-back .small-note']);
    const patientMeta = getFirstText(['.patient-info-bar .patient-meta', '.patient-meta']);

    const birthDate =
      standaloneMeta.match(/\b\d{2}\.\d{2}\.\d{4}\b/u)?.[0] ||
      getFirstText(['.patient-name']).match(/\b\d{2}\.\d{2}\.\d{4}\b/u)?.[0] ||
      '';

    const iin =
      extractRowValue('иин') ||
      patientMeta.match(/ИИН:\s*([0-9]{10,14})/iu)?.[1] ||
      '';

    const historyNumber =
      getFirstText(['h2', '.panel-title']).match(/№\s*([0-9]+)/u)?.[1] ||
      '';

    const caseNumber =
      getFirstText(['.patient-name', '.standalone-back h1']).match(/№\s*([0-9]+)/u)?.[1] ||
      '';

    const admissionDate =
      extractRowValue('поступление') ||
      patientMeta.match(/Поступление:\s*([^·]+)/iu)?.[1]?.trim() ||
      '';

    const department =
      extractRowValue('отделение') ||
      getFirstText(['.user-position']).split('(')[0]?.trim() ||
      '';

    const diagnosis =
      extractRowValue('диагноз') ||
      document.querySelector('input[readonly][value*="G"]')?.value?.trim() ||
      '';

    const doctorName = getFirstText(['.user-name']) || 'Лечащий врач';
    const doctorPosition = getFirstText(['.user-position']);

    return {
      patientName,
      birthDate,
      iin,
      historyNumber,
      caseNumber,
      admissionDate,
      department,
      diagnosis,
      doctorName,
      doctorPosition,
    };
  };

  const buildFinalDocument = () => {
    const get = (id) => document.getElementById(id)?.value?.trim() || '';
    const patient = extractPatientContext();

    const complaints = get('complaints');
    const anamnesis = get('anamnesis');
    const lifeAnamnesis = get('notes');
    const objectiveStatus = get('objectiveStatus');
    const recommendations = get('recommendations');

    const anamnesisFull = [
      anamnesis ? `Анамнез заболевания:\n${anamnesis}` : '',
      lifeAnamnesis ? `Анамнез жизни:\n${lifeAnamnesis}` : '',
    ]
      .filter(Boolean)
      .join('\n\n');

    const dateInput = document.getElementById('dtpMedRecRegDate');
    const recordDate =
      toCompactDateTime(dateInput?.value) ||
      new Date().toLocaleString('ru-RU', { dateStyle: 'long', timeStyle: 'short' });

    const recordTypeSel = document.getElementById('ddlMedicalRecordType');
    const recordType = recordTypeSel?.selectedOptions?.[0]?.text?.trim() || 'Осмотр врача приёмного покоя';

    const historyInfo = [
      patient.caseNumber ? `№${patient.caseNumber}` : '',
      patient.historyNumber ? `История болезни №${patient.historyNumber}` : '',
    ]
      .filter(Boolean)
      .join(' / ');

    const html = `
      <div class="doc-header">
        <div class="doc-org">Медицинская карта стационарного пациента</div>
        <div class="doc-title">${escapeHtml(recordType)}</div>
      </div>
      <div class="doc-meta-grid">
        <div><span class="doc-meta-key">Пациент:</span> <strong>${escapeHtml(patient.patientName)}</strong></div>
        <div><span class="doc-meta-key">Дата рождения:</span> ${escapeHtml(patient.birthDate || 'не указана')}</div>
        <div><span class="doc-meta-key">ИИН:</span> <span style="font-family:monospace;">${escapeHtml(patient.iin || 'не указан')}</span></div>
        <div><span class="doc-meta-key">Номер карты:</span> ${escapeHtml(historyInfo || 'не указан')}</div>
        <div><span class="doc-meta-key">Дата и время осмотра:</span> ${escapeHtml(recordDate)}</div>
        <div><span class="doc-meta-key">Отделение:</span> ${escapeHtml(patient.department || 'не указано')}</div>
        ${patient.admissionDate ? `<div><span class="doc-meta-key">Поступление:</span> ${escapeHtml(patient.admissionDate)}</div>` : ''}
        ${patient.diagnosis ? `<div><span class="doc-meta-key">Диагноз:</span> ${escapeHtml(patient.diagnosis)}</div>` : ''}
      </div>
      <div class="doc-toc">
        <div class="doc-toc-title">Оглавление</div>
        <ol class="doc-toc-list">
          <li><a href="#doc-complaints">Жалобы</a></li>
          <li><a href="#doc-anamnesis">Анамнез</a></li>
          <li><a href="#doc-status">Статус</a></li>
          <li><a href="#doc-recommendations">Рекомендации</a></li>
        </ol>
      </div>
      <div class="doc-section" id="doc-complaints">
        <div class="doc-section-title">Жалобы</div>
        <div class="doc-section-body">${toSectionBodyHtml(complaints)}</div>
      </div>
      <div class="doc-section" id="doc-anamnesis">
        <div class="doc-section-title">Анамнез</div>
        <div class="doc-section-body">${toSectionBodyHtml(anamnesisFull)}</div>
      </div>
      <div class="doc-section" id="doc-status">
        <div class="doc-section-title">Статус</div>
        <div class="doc-section-body">${toSectionBodyHtml(objectiveStatus)}</div>
      </div>
      <div class="doc-section" id="doc-recommendations">
        <div class="doc-section-title">Рекомендации</div>
        <div class="doc-section-body">${toSectionBodyHtml(recommendations)}</div>
      </div>
      <div class="doc-footer">
        <div>Врач: <strong>${escapeHtml(patient.doctorName)}</strong></div>
        ${patient.doctorPosition ? `<div>Специализация: ${escapeHtml(patient.doctorPosition)}</div>` : ''}
        <div style="margin-top:8px;">Подпись: _____________________</div>
      </div>
    `;

    const fileDate = dateInput?.value ? dateInput.value.slice(0, 10) : new Date().toISOString().slice(0, 10);
    const fileName = `${normalizeForFileName(recordType)}_${normalizeForFileName(patient.patientName)}_${fileDate}.pdf`;

    return { html, fileName };
  };

  // Generate final document
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action="generate-document"]');
    if (!btn) {
      return;
    }

    const docEl = document.getElementById('final-document');
    const bodyEl = document.getElementById('final-document-body');
    if (!docEl || !bodyEl) {
      return;
    }

    const { html, fileName } = buildFinalDocument();
    bodyEl.innerHTML = html;
    bodyEl.dataset.pdfFilename = fileName;

    docEl.style.display = 'block';
    docEl.scrollIntoView({ behavior: 'smooth', block: 'start' });

    showToast('✓ Итоговый лист сформирован как документ медкарты');
  });

  // Download final document as PDF
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action="download-document-pdf"]');
    if (!btn) {
      return;
    }

    const bodyEl = document.getElementById('final-document-body');
    const docEl = document.getElementById('final-document');
    if (!bodyEl || !docEl || docEl.style.display === 'none' || !bodyEl.innerHTML.trim()) {
      showToast('Сначала сформируйте итоговый лист');
      return;
    }

    if (typeof window.html2pdf !== 'function') {
      showToast('PDF модуль не загружен. Используйте "Печать / PDF".');
      return;
    }

    const previousText = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Формирую PDF...';

    try {
      await window.html2pdf()
        .set({
          margin: [8, 8, 8, 8],
          filename: bodyEl.dataset.pdfFilename || 'itogovy_list.pdf',
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
          pagebreak: { mode: ['css', 'legacy'] },
        })
        .from(bodyEl)
        .save();

      showToast('✓ PDF документ сохранён');
    } catch (error) {
      console.error(error);
      showToast('Не удалось сформировать PDF');
    } finally {
      btn.disabled = false;
      btn.textContent = previousText;
    }
  });

  // Edit document (back to form)
  document.addEventListener('click', (e) => {
    if (!e.target.closest('[data-action="edit-document"]')) {
      return;
    }

    const docEl = document.getElementById('final-document');
    if (docEl) {
      docEl.style.display = 'none';
    }

    document.getElementById('complaints')?.focus();
  });
});
