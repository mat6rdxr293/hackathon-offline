import type { MedicalData } from '@hackathon/shared';

type Vitals = {
  temperature?: string;
  pulse?: string;
  systolic?: string;
  diastolic?: string;
  breath?: string;
  saturation?: string;
  weight?: string;
};

import { ActionExecutor } from './actionExecutor';
import { ElementResolver } from './elementResolver';

export class FormFiller {
  constructor(
    private readonly resolver: ElementResolver,
    private readonly executor: ActionExecutor,
  ) {}

  fillPrimaryExam(data: MedicalData): { filled: string[]; missing: string[] } {
    const filled: string[] = [];
    const missing: string[] = [];

    const textFields = ['complaints', 'anamnesis', 'objectiveStatus', 'recommendations', 'notes'] as const;
    for (const key of textFields) {
      const value = data[key];
      if (!value) continue;
      const field = this.resolver.resolvePrimaryExamField(key);
      if (!field) {
        missing.push(key);
        continue;
      }
      this.executor.safeFill(field, value);
      filled.push(key);
    }

    if (data.registrationDate) {
      const dateInput = this.resolver.resolveRegistrationDateInput();
      if (dateInput) {
        this.executor.safeFill(dateInput, data.registrationDate);
        filled.push('registrationDate');
      }
    }

    if (data.recordType) {
      const select = this.resolver.resolveRecordTypeSelect();
      if (select) {
        try {
          this.executor.safeSelect(select, data.recordType);
          filled.push('recordType');
        } catch {
          // option not found — skip
        }
      }
    }

    return { filled, missing };
  }

  fillDischargeSummary(
    text: string,
    dischargeDate?: string,
    outcome?: string,
  ): { filled: string[]; missing: string[] } {
    const filled: string[] = [];
    const missing: string[] = [];

    const field = this.resolver.resolveDischargeField();
    if (!field) {
      missing.push('discharge-summary-field');
    } else {
      this.executor.safeFill(field, text);
      filled.push('discharge-summary-field');
    }

    if (dischargeDate) {
      const dateInput = this.resolver.resolveDischargeDateInput();
      if (dateInput) {
        this.executor.safeFill(dateInput, dischargeDate);
        filled.push('dischargeDate');
      }
    }

    if (outcome) {
      const select = this.resolver.resolveOutcomeSelect();
      if (select) {
        try {
          this.executor.safeSelect(select, outcome);
          filled.push('outcome');
        } catch {
          // option not found — skip
        }
      }
    }

    return { filled, missing };
  }

  fillDiaryNote(text: string, vitals: Vitals = {}, entryDate?: string): { filled: string[]; missing: string[] } {
    const filled: string[] = [];
    const missing: string[] = [];

    if (entryDate) {
      const dateInput = this.resolver.resolveDiaryDateInput();
      if (dateInput) {
        this.executor.safeFill(dateInput, entryDate);
        filled.push('entryDate');
      }
    }

    const diaryField = this.resolver.resolveDiaryField();
    if (diaryField) {
      this.executor.safeFill(diaryField, text);
      filled.push('diary-note');
    } else {
      missing.push('diary-note');
    }

    const vitalMap: Record<keyof Vitals, string> = {
      temperature: 'ntbTemperature',
      pulse: 'ntbPulse',
      systolic: 'ntbTopPressure',
      diastolic: 'ntbBottomPressure',
      breath: 'ntbBreath',
      saturation: 'ntbSaturation',
      weight: 'ntbWeight',
    };

    for (const [key, inputId] of Object.entries(vitalMap) as Array<[keyof Vitals, string]>) {
      const val = vitals[key];
      if (!val) continue;
      const input = this.resolver.resolveVitalInput(inputId);
      if (input) {
        this.executor.safeFill(input, val);
        filled.push(inputId);
      }
    }

    return { filled, missing };
  }
}
