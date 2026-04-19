import { translateByLocale, type AppLocale, type MedicalData, type NavigationTarget, type ScheduleGenerationResult } from '@hackathon/shared';

export type DomAction = { sel: string; action: 'fill' | 'click' | 'select'; value?: string };

type ScannedEl = { sel: string; label: string; tag?: string; val?: string; opts?: string[]; active?: boolean };
export type PageSnapshot = {
  pageType: string;
  tabs: ScannedEl[];
  fields: ScannedEl[];
  buttons: Pick<ScannedEl, 'sel' | 'label'>[];
};

import { ActionExecutor } from './actionExecutor';
import { ElementResolver } from './elementResolver';
import { FormFiller } from './formFiller';
import { Highlighter } from './highlighter';
import { PageInspector } from './pageInspector';

const withRetries = async <T>(fn: () => T, retries = 3, delay = 150): Promise<T> => {
  let attempt = 0;
  let lastError: unknown;

  while (attempt < retries) {
    try {
      return fn();
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => window.setTimeout(resolve, delay));
      attempt += 1;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Unknown execution error');
};

export class DomEngine {
  private readonly highlighter = new Highlighter();
  private readonly executor = new ActionExecutor(this.highlighter);
  private readonly resolver = new ElementResolver();
  private readonly filler = new FormFiller(this.resolver, this.executor);
  private readonly inspector = new PageInspector();

  // ── Smart DOM scanner ────────────────────────────────────────────────────
  scanPage(): PageSnapshot {
    const isVisible = (el: Element): boolean => {
      const r = (el as HTMLElement).getBoundingClientRect();
      return !!(r.width || r.height) && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden';
    };

    const getLabel = (el: Element): string => {
      const id = (el as HTMLElement).id;
      if (id) {
        const lbl = document.querySelector<HTMLElement>(`label[for="${id}"]`);
        if (lbl) return lbl.textContent?.trim() ?? '';
      }
      const parent = el.closest('.anamnesis-block, .form-group, .field-group');
      return parent?.querySelector('.anamnesis-block-title, label')?.textContent?.trim() ?? el.getAttribute('placeholder') ?? '';
    };

    const tabs = Array.from(document.querySelectorAll<HTMLElement>('[data-tab]'))
      .filter(isVisible)
      .map((el) => ({
        sel: `[data-tab="${el.getAttribute('data-tab')}"]`,
        label: el.textContent?.trim() ?? '',
        active: el.classList.contains('is-active'),
      }));

    const fields = Array.from(document.querySelectorAll<HTMLElement>('textarea, input:not([type="checkbox"]):not([type="hidden"]), select'))
      .filter(isVisible)
      .slice(0, 25)
      .map((el) => {
        const id = el.id;
        const df = el.getAttribute('data-field');
        const sel = id ? `#${id}` : df ? `[data-field="${df}"]` : null;
        if (!sel) return null;
        const val = (el as HTMLInputElement).value?.slice(0, 60) ?? '';
        const opts = el instanceof HTMLSelectElement
          ? Array.from(el.options).map((o) => o.text.trim()).filter(Boolean)
          : undefined;
        return { sel, tag: el.tagName.toLowerCase(), label: getLabel(el), val, ...(opts ? { opts } : {}) };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);

    const buttons = Array.from(document.querySelectorAll<HTMLElement>('button[data-action], button.btn'))
      .filter(isVisible)
      .slice(0, 12)
      .map((el) => {
        const da = el.getAttribute('data-action');
        return { sel: da ? `[data-action="${da}"]` : '', label: el.textContent?.trim() ?? '' };
      })
      .filter((b) => b.sel);

    return { pageType: this.inspector.detect(), tabs, fields, buttons };
  }

  async executeActions(actions: DomAction[], locale: AppLocale): Promise<{ title: string; details: string; count: number }> {
    let count = 0;
    for (const act of actions) {
      const el = document.querySelector<HTMLElement>(act.sel);
      if (!el) continue;
      try {
        if (act.action === 'fill') this.executor.safeFill(el, act.value ?? '');
        else if (act.action === 'click') this.executor.safeClick(el);
        else if (act.action === 'select') this.executor.safeSelect(el, act.value ?? '');
        count++;
        // Small gap between actions for DOM stability
        await new Promise((r) => setTimeout(r, 60));
      } catch { /* skip failed action */ }
    }
    return {
      title: translateByLocale(locale, 'dom.fill.title'),
      details: `Выполнено ${count} из ${actions.length} действий`,
      count,
    };
  }

  inspectPage(): string {
    return this.inspector.detect();
  }

  extractPatientInfo(): Record<string, string> {
    const get = (selector: string): string =>
      document.querySelector(selector)?.textContent?.trim() ?? '';

    const infoRows = Array.from(document.querySelectorAll('.patient-info-row'));
    const rowMap: Record<string, string> = {};
    for (const row of infoRows) {
      const label = row.querySelector('.patient-info-label')?.textContent?.trim().toLowerCase() ?? '';
      const value = row.querySelector('.patient-info-value')?.textContent?.trim() ?? '';
      if (label && value) rowMap[label] = value;
    }

    // Try multiple sources — patient-info-card (sidebar) or patient-info-bar (top strip)
    const name =
      get('.patient-info-card-name') ||
      get('.patient-name') ||
      get('.patient-bar-name') ||
      '';

    const meta = get('.patient-info-card-meta') || get('.patient-meta') || '';

    // Extract DOB + age from meta string like "08.01.2014 · 12 лет · №565"
    const dobMatch = meta.match(/(\d{2}\.\d{2}\.\d{4})/);
    const ageMatch = meta.match(/(\d+)\s*л/);
    const wardMatch = meta.match(/№(\d+)/);

    return {
      name,
      dob: rowMap['дата рождения'] || dobMatch?.[1] || '',
      age: ageMatch?.[1] || '',
      iin: rowMap['ИИН'] || rowMap['иин'] || '',
      diagnosis: (() => {
        const el = document.querySelector('td:not([data-col]) span[style*="color"]');
        if (el) {
          const code = el.textContent?.trim() ?? '';
          const title = el.parentElement?.textContent?.trim().replace(code, '').trim() ?? '';
          return code && title ? `${code} ${title}` : code || title;
        }
        return rowMap['диагноз'] || '';
      })(),
      admissionDate: rowMap['поступление'] || rowMap['дата поступления'] || '',
      ward: rowMap['палата'] || wardMatch?.[1] || '',
      doctor: rowMap['лечащий врач'] || '',
      department: rowMap['отделение'] || '',
      hospital: document.title.includes('Dmed') || document.title.includes('Damu')
        ? 'Городская клиническая детская больница'
        : '',
    };
  }

  async navigate(target: NavigationTarget, locale: AppLocale, recordType?: string): Promise<{ title: string; details: string }> {
    return withRetries(() => {
      const element = this.resolver.resolveNavigation(target);
      if (!element) {
        throw new Error(`Navigation target not found: ${target}`);
      }

      this.executor.safeClick(element);

      if (target === 'primary_exam' && recordType) {
        const select = this.resolver.resolveRecordTypeSelect();
        if (select) {
          try { this.executor.safeSelect(select, recordType); } catch { /* option not found */ }
        }
      }

      return {
        title: translateByLocale(locale, 'dom.navigate.title', { target }),
        details: recordType
          ? `${translateByLocale(locale, 'dom.navigate.details')} · ${recordType}`
          : translateByLocale(locale, 'dom.navigate.details'),
      };
    });
  }

  async fillPrimaryExam(data: MedicalData, locale: AppLocale): Promise<{ title: string; details: string }> {
    return withRetries(() => {
      const result = this.filler.fillPrimaryExam(data);
      return {
        title: translateByLocale(locale, 'dom.fill.title'),
        details: translateByLocale(locale, 'dom.fill.details', {
          filled: result.filled.join(', ') || '0',
          missing: result.missing.join(', ') || translateByLocale(locale, 'panel.empty'),
        }),
      };
    });
  }

  async fillDischargeSummary(
    text: string,
    locale: AppLocale,
    dischargeDate?: string,
    outcome?: string,
  ): Promise<{ title: string; details: string }> {
    return withRetries(() => {
      const result = this.filler.fillDischargeSummary(text, dischargeDate, outcome);
      return {
        title: translateByLocale(locale, 'dom.fill.title'),
        details: translateByLocale(locale, 'dom.fill.details', {
          filled: result.filled.join(', ') || '0',
          missing: result.missing.join(', ') || translateByLocale(locale, 'panel.empty'),
        }),
      };
    });
  }

  async fillDiaryNote(
    text: string,
    vitals: Record<string, string>,
    locale: AppLocale,
    entryDate?: string,
  ): Promise<{ title: string; details: string }> {
    return withRetries(() => {
      const result = this.filler.fillDiaryNote(text, vitals, entryDate);
      return {
        title: translateByLocale(locale, 'dom.fill.title'),
        details: translateByLocale(locale, 'dom.fill.details', {
          filled: result.filled.join(', ') || '0',
          missing: result.missing.join(', ') || translateByLocale(locale, 'panel.empty'),
        }),
      };
    });
  }

  async applySchedule(schedule: ScheduleGenerationResult, locale: AppLocale): Promise<{ title: string; details: string }> {
    return withRetries(() => {
      const container = this.resolver.resolveScheduleTableBody();
      if (!container) {
        throw new Error('Schedule container not found');
      }

      const SPECIALIST_ROOMS: Record<string, string> = {
        'spec-lfk': 'Каб. 204',
        'spec-massage': 'Каб. 108',
        'spec-physio': 'Каб. 310',
        'spec-psych': 'Каб. 215',
      };

      const SPECIALIST_LABELS: Record<string, string> = {
        'spec-lfk': 'Инструктор ЛФК',
        'spec-massage': 'Массажист',
        'spec-physio': 'Физиотерапевт',
        'spec-psych': 'Психолог',
      };

      container.innerHTML = '';

      // Group items by date for rowspan on date cells
      const byDate: Map<string, typeof schedule.items> = new Map();
      for (const item of schedule.items) {
        const existing = byDate.get(item.date) ?? [];
        existing.push(item);
        byDate.set(item.date, existing);
      }

      let scheduleIndex = 1;
      for (const [date, items] of byDate) {
        items.forEach((item, idx) => {
          const room = item.room ?? SPECIALIST_ROOMS[item.specialistId] ?? 'Каб. 100';
          const specialist = SPECIALIST_LABELS[item.specialistId] ?? item.specialistId;
          const schedId = `s-ai-${scheduleIndex++}`;
          const isSecond = idx > 0;
          const row = document.createElement('tr');
          row.className = isSecond ? 'schedule-row schedule-row-2' : 'schedule-row';
          row.innerHTML = `
            ${!isSecond ? `<td class="schedule-date-cell" rowspan="${items.length}">${date}</td>` : ''}
            <td class="schedule-time">${item.start}</td>
            <td data-col="title">${item.procedureTitle}</td>
            <td>${specialist}</td>
            <td>${room}</td>
            <td class="schedule-check-cell">
              <label class="schedule-check-label">
                <input type="checkbox" class="schedule-check" data-schedule-id="${schedId}">
                <span class="schedule-check-box"></span>
              </label>
            </td>`;
          container.appendChild(row);
        });
      }

      // Re-wire newly created checkboxes to update progress counter
      const doneCountEl = document.getElementById('schedule-done-count');
      if (doneCountEl) {
        const allChecks = Array.from(container.querySelectorAll<HTMLInputElement>('.schedule-check'));
        const update = () => {
          const done = allChecks.filter((c) => c.checked).length;
          doneCountEl.textContent = `${done} / ${allChecks.length} выполнено`;
          doneCountEl.classList.toggle('schedule-progress-badge--done', done === allChecks.length && allChecks.length > 0);
        };
        allChecks.forEach((cb) => cb.addEventListener('change', () => {
          cb.closest('tr')?.classList.toggle('schedule-row--done', cb.checked);
          update();
        }));
        update();
      }

      this.executor.focus(container);

      return {
        title: translateByLocale(locale, 'dom.schedule.title'),
        details: translateByLocale(locale, 'dom.schedule.details', {
          items: schedule.items.length,
          unplaced: schedule.unplaced.length,
        }),
      };
    });
  }

  async completeService(note: string | undefined, locale: AppLocale, procedureName?: string): Promise<{ title: string; details: string }> {
    return withRetries(() => {
      let button = this.resolver.resolveServiceCompleteButton(procedureName);
      if (!button) {
        const proceduresTab = this.resolver.resolveNavigation('procedures');
        if (proceduresTab) {
          this.executor.safeClick(proceduresTab);
          button = this.resolver.resolveServiceCompleteButton(procedureName);
        }
      }
      if (!button) {
        throw new Error('Service complete button not found');
      }

      this.executor.safeClick(button);

      const diaryField = this.resolver.resolveDiaryField();
      if (diaryField) {
        this.executor.safeFill(
          diaryField,
          note ??
            translateByLocale(locale, 'dom.complete.note', {
              time: new Date().toLocaleString(locale === 'kk' ? 'kk-KZ' : locale === 'en' ? 'en-US' : 'ru-RU'),
            }),
        );
      }

      const submit = this.resolver.resolveDiarySubmitButton();
      if (submit) {
        this.executor.safeClick(submit);
      }

      return {
        title: translateByLocale(locale, 'dom.complete.title'),
        details: translateByLocale(locale, 'dom.complete.details'),
      };
    });
  }

  extractScheduleContext(locale: AppLocale): {
    procedures: Array<{
      id: string;
      type: 'lfk' | 'massage' | 'physio';
      title: string;
      specialistId: string;
      durationMinutes: number;
      sessions: number;
    }>;
    specialistAvailability: Array<{ specialistId: string; workStart: string; workEnd: string }>;
    busySlots: Array<{ specialistId: string; date: string; start: string; end: string }>;
  } {
    const procedures = Array.from(document.querySelectorAll('[data-procedure-id]')).map((row, index) => {
      const type = (row.getAttribute('data-procedure-type') || 'lfk') as 'lfk' | 'massage' | 'physio';
      const specialistId = row.getAttribute('data-specialist-id') || `spec-${index + 1}`;
      const sessions = Number(row.getAttribute('data-sessions') || '3');
      const duration = Number(row.getAttribute('data-duration') || '30');
      const title =
        row.querySelector('[data-col="title"]')?.textContent?.trim() ||
        translateByLocale(locale, 'dom.procedure.default', { index: index + 1 });

      return {
        id: row.getAttribute('data-procedure-id') || `proc-${index + 1}`,
        type,
        title,
        specialistId,
        durationMinutes: duration,
        sessions,
      };
    });

    const specialistAvailability = Array.from(document.querySelectorAll('[data-specialist-availability]')).map((node) => ({
      specialistId: node.getAttribute('data-specialist-id') || 'spec-1',
      workStart: node.getAttribute('data-work-start') || '09:00',
      workEnd: node.getAttribute('data-work-end') || '18:00',
    }));

    const busySlots = Array.from(document.querySelectorAll('[data-busy-slot]')).map((node) => ({
      specialistId: node.getAttribute('data-specialist-id') || 'spec-1',
      date: node.getAttribute('data-date') || new Date().toISOString().slice(0, 10),
      start: node.getAttribute('data-start') || '10:00',
      end: node.getAttribute('data-end') || '10:30',
    }));

    return {
      procedures,
      specialistAvailability,
      busySlots,
    };
  }

  saveCurrentForm(locale: AppLocale): { title: string; details: string } {
    const saveBtn = this.resolver.resolvePrimarySaveButton() ?? this.resolver.resolveDiarySubmitButton();
    if (!saveBtn) throw new Error('Save button not found on page');
    this.executor.safeClick(saveBtn);
    return {
      title: translateByLocale(locale, 'dom.save.title'),
      details: translateByLocale(locale, 'dom.save.details'),
    };
  }

  async generateDocument(locale: AppLocale): Promise<{ title: string; details: string }> {
    const generateBtn = document.querySelector<HTMLElement>('[data-action="generate-document"]');
    if (!generateBtn) {
      throw new Error('Generate document button not found');
    }
    this.executor.safeClick(generateBtn);

    await new Promise((resolve) => window.setTimeout(resolve, 800));

    const downloadBtn = document.querySelector<HTMLElement>('[data-action="download-document-pdf"]');
    if (!downloadBtn) {
      throw new Error('Download PDF button not found');
    }
    this.executor.safeClick(downloadBtn);

    return {
      title: translateByLocale(locale, 'dom.document.title'),
      details: translateByLocale(locale, 'dom.document.details'),
    };
  }
}
