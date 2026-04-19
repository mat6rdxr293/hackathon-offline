import { TARGET_SYNONYMS, type MedicalData, type NavigationTarget } from '@hackathon/shared';

const CLICKABLE_SELECTOR = 'button, a, [role="tab"], [role="button"], .tab, .nav-link';

const normalize = (text: string): string => text.trim().toLowerCase().normalize('NFKC').replace(/ё/g, 'е');

const matchesAny = (candidate: string, variants: string[]): boolean => variants.some((variant) => candidate.includes(variant));

const candidateText = (element: Element): string =>
  normalize(
    [
      element.textContent,
      element.getAttribute('aria-label'),
      element.getAttribute('title'),
      element.getAttribute('data-label'),
      element.getAttribute('data-target'),
    ]
      .filter(Boolean)
      .join(' '),
  );

const findFieldByLabel = (aliases: string[]): HTMLElement | null => {
  const labels = Array.from(document.querySelectorAll('label'));

  for (const label of labels) {
    const text = normalize(label.textContent ?? '');
    if (!matchesAny(text, aliases)) continue;

    const htmlFor = label.getAttribute('for');
    if (htmlFor) {
      const byFor = document.getElementById(htmlFor);
      if (byFor instanceof HTMLElement) return byFor;
    }

    const nested = label.querySelector('input, textarea, select');
    if (nested instanceof HTMLElement) return nested;

    const sibling = label.parentElement?.querySelector('input, textarea, select');
    if (sibling instanceof HTMLElement) return sibling;
  }

  return null;
};

type PrimaryExamTextField = 'complaints' | 'anamnesis' | 'objectiveStatus' | 'recommendations' | 'notes';

const medicalFieldAliases: Record<PrimaryExamTextField, string[]> = {
  complaints: ['Р¶Р°Р»РѕР±С‹', 'С€Р°Т“С‹Рј', 'complaints', 'complaint'],
  anamnesis: ['Р°РЅР°РјРЅРµР·', 'anamnesis'],
  objectiveStatus: ['РѕР±СЉРµРєС‚РёРІ', 'РѕР±СЉРµРєС‚РёРІС‚С–', 'objective', 'status'],
  recommendations: ['СЂРµРєРѕРјРµРЅРґР°С†', 'РЅР°Р·РЅР°С‡РµРЅРё', 'Т±СЃС‹РЅС‹СЃ', 'recommendation'],
  notes: ['Р·Р°РјРµС‚РєРё', 'РєРѕРјРјРµРЅС‚Р°СЂ', 'РµСЃРєРµСЂС‚Сѓ', 'notes'],
};

const diarySaveAliases = ['РґРѕР±Р°РІРёС‚СЊ Р·Р°РїРёСЃСЊ', 'СЃРѕС…СЂР°РЅРёС‚СЊ', 'СЃР°Т›С‚Р°Сѓ', 'save note', 'add note'];
const completeServiceAliases = ['РІС‹РїРѕР»РЅРµРЅРѕ', 'РѕСЂС‹РЅРґР°Р»РґС‹', 'completed', 'done'];
const saveAliases = ['СЃРѕС…СЂР°РЅРёС‚СЊ', 'СЃР°Т›С‚Р°Сѓ', 'save'];
const registrationDateAliases = ['дата и время осмотра', 'дата осмотра', 'дата регистрации', 'registration date'];
const recordTypeAliases = ['тип записи', 'вид записи', 'record type'];
const primaryRecordTypeOptionAliases = [
  'осмотр врача приемного покоя',
  'первичный осмотр',
  'плановый осмотр',
  'итоговая запись',
];

export class ElementResolver {
  resolveNavigation(target: NavigationTarget): HTMLElement | null {
    // 1. Direct data-tab / data-section attribute match вЂ” most reliable, no text ambiguity
    const byDataTab = document.querySelector<HTMLElement>(`[data-tab="${target}"]`);
    if (byDataTab) return byDataTab;

    // 2. Partial data-tab match (e.g. target="primary_exam" matches data-tab="primary_exam")
    const allTabs = Array.from(document.querySelectorAll<HTMLElement>('[data-tab]'));
    for (const tab of allTabs) {
      const tabVal = tab.getAttribute('data-tab') ?? '';
      if (tabVal === target || target.includes(tabVal) || tabVal.includes(target)) {
        return tab;
      }
    }

    // 3. Text-content alias match (fallback for real DMed navigation)
    const aliases = TARGET_SYNONYMS[target].map(normalize);
    const clickable = Array.from(document.querySelectorAll(CLICKABLE_SELECTOR));
    for (const element of clickable) {
      if (element instanceof HTMLElement && matchesAny(candidateText(element), aliases)) {
        return element;
      }
    }

    return null;
  }

  resolvePrimaryExamField(field: PrimaryExamTextField): HTMLElement | null {
    const aliases = medicalFieldAliases[field];
    const selector = [
      `[data-field="${field}"]`,
      `[name="${field}"]`,
      `#${field}`,
      `textarea[name*="${field.toLowerCase()}"]`,
      `input[name*="${field.toLowerCase()}"]`,
      `textarea[placeholder*="${aliases[0]}"]`,
      `textarea[aria-label*="${aliases[0]}"]`,
      `input[placeholder*="${aliases[0]}"]`,
    ].join(', ');

    const direct = document.querySelector(selector);
    if (direct instanceof HTMLElement) return direct;

    const byLabel = findFieldByLabel(aliases);
    if (byLabel) return byLabel;

    const genericFields = Array.from(document.querySelectorAll('input, textarea'));
    for (const fieldElement of genericFields) {
      const meta = normalize(
        `${fieldElement.getAttribute('name') ?? ''} ${fieldElement.getAttribute('id') ?? ''} ${
          fieldElement.getAttribute('placeholder') ?? ''
        } ${fieldElement.getAttribute('aria-label') ?? ''}`,
      );
      if (fieldElement instanceof HTMLElement && matchesAny(meta, aliases)) {
        return fieldElement;
      }
    }

    return null;
  }

  resolveDischargeField(): HTMLElement | null {
    const el = document.querySelector(
      '#discharge-summary-field, [data-field="discharge-summary"], textarea[placeholder*="РїРѕСЃС‚СѓРїРёР»"]',
    );
    return el instanceof HTMLElement ? el : null;
  }

  resolveVitalInput(id: string): HTMLInputElement | null {
    const el = document.getElementById(id);
    return el instanceof HTMLInputElement ? el : null;
  }

  resolveDiaryField(): HTMLElement | null {
    // Mock: plain textarea with data-field or id
    const field = document.querySelector('[data-field="diary-note"], #diary-note, textarea[name="diaryNote"]');
    if (field instanceof HTMLElement) return field;

    // Real DMed: TinyEditor вЂ” the hidden textarea that backs the rich-text iframe
    const tinyArea = document.querySelector('textarea[id^="tinyeditor_"]');
    if (tinyArea instanceof HTMLElement) return tinyArea;

    return null;
  }

  resolveDiarySubmitButton(): HTMLElement | null {
    const candidates = Array.from(document.querySelectorAll(CLICKABLE_SELECTOR));
    const found = candidates.find((item) => matchesAny(candidateText(item), diarySaveAliases));
    return found instanceof HTMLElement ? found : null;
  }

  resolveServiceCompleteButton(procedureName?: string): HTMLElement | null {
    const directButtons = Array.from(document.querySelectorAll<HTMLElement>('[data-action="complete-service"]')).filter(
      (button) => !(button instanceof HTMLButtonElement && button.disabled),
    );

    if (procedureName) {
      const nameLower = procedureName.trim().toLowerCase();
      const rows = Array.from(document.querySelectorAll('tr[data-procedure-id]'));
      for (const row of rows) {
        const status = normalize(row.querySelector('[data-col="status"]')?.textContent ?? '');
        if (status.includes('выполн') || status.includes('completed') || status.includes('done')) {
          continue;
        }

        const titleCell = row.querySelector('[data-col="title"]');
        const title = titleCell?.textContent?.trim().toLowerCase() ?? '';
        if (title && (nameLower.includes(title) || title.includes(nameLower))) {
          const btn = row.querySelector<HTMLElement>('[data-action="complete-service"]');
          if (btn instanceof HTMLButtonElement && !btn.disabled) return btn;
        }
      }
    }

    if (directButtons.length > 0) {
      return directButtons[0] ?? null;
    }

    const candidates = Array.from(document.querySelectorAll('[data-action="complete-service"], button'));
    for (const candidate of candidates) {
      const disabled = candidate instanceof HTMLButtonElement && candidate.disabled;
      if (!disabled && candidate instanceof HTMLElement && matchesAny(candidateText(candidate), completeServiceAliases)) {
        return candidate;
      }
    }

    return null;
  }

  resolveRegistrationDateInput(): HTMLInputElement | null {
    const el = document.getElementById('dtpMedRecRegDate');
    if (el instanceof HTMLInputElement) return el;

    const byLabel = findFieldByLabel(registrationDateAliases);
    if (byLabel instanceof HTMLInputElement) return byLabel;

    const dateInputs = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="datetime-local"]'));
    const byMeta = dateInputs.find((input) => {
      const meta = normalize(
        `${input.id} ${input.name} ${input.getAttribute('aria-label') ?? ''} ${input.getAttribute('placeholder') ?? ''}`,
      );
      return meta.includes('medrec') || meta.includes('осмотр') || meta.includes('registration');
    });
    if (byMeta) return byMeta;

    const primarySectionInput = document.querySelector<HTMLInputElement>('[data-section="primary_exam"] input[type="datetime-local"]');
    if (primarySectionInput) return primarySectionInput;

    return null;
  }

  resolveRecordTypeSelect(): HTMLSelectElement | null {
    const el = document.getElementById('ddlMedicalRecordType');
    if (el instanceof HTMLSelectElement) return el;

    const byLabel = findFieldByLabel(recordTypeAliases);
    if (byLabel instanceof HTMLSelectElement) return byLabel;

    const selects = Array.from(document.querySelectorAll<HTMLSelectElement>('select'));
    for (const select of selects) {
      const optionTexts = Array.from(select.options).map((opt) => normalize(opt.textContent ?? ''));
      const hits = primaryRecordTypeOptionAliases.reduce(
        (count, alias) => (optionTexts.some((opt) => opt.includes(alias)) ? count + 1 : count),
        0,
      );
      if (hits >= 2) {
        return select;
      }
    }

    return null;
  }

  resolveDischargeDateInput(): HTMLInputElement | null {
    const el = document.getElementById('dtpDischargeDate');
    if (el instanceof HTMLInputElement) return el;
    const generic = document.querySelector<HTMLInputElement>('[data-section="discharge_summary"] input[type="datetime-local"]');
    return generic ?? null;
  }

  resolveOutcomeSelect(): HTMLSelectElement | null {
    const el = document.getElementById('ddlOutcome');
    if (el instanceof HTMLSelectElement) return el;
    const generic = document.querySelector<HTMLSelectElement>('[data-section="discharge_summary"] select');
    return generic ?? null;
  }

  resolveDiaryDateInput(): HTMLInputElement | null {
    const el = document.getElementById('dtRegDateTime');
    return el instanceof HTMLInputElement ? el : null;
  }

  resolveScheduleTableBody(): HTMLElement | null {
    const element = document.querySelector('[data-role="schedule-grid"], #schedule-grid tbody, #schedule-grid');
    return element instanceof HTMLElement ? element : null;
  }

  resolvePrimarySaveButton(): HTMLElement | null {
    const candidates = Array.from(document.querySelectorAll(CLICKABLE_SELECTOR));
    const found = candidates.find((item) => matchesAny(candidateText(item), saveAliases));
    return found instanceof HTMLElement ? found : null;
  }
}

