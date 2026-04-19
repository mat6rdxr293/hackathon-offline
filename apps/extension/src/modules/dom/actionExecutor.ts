import { Highlighter } from './highlighter';

export class ActionExecutor {
  constructor(private readonly highlighter: Highlighter) {}

  private dispatchEvents(element: HTMLElement, events: string[]): void {
    for (const eventName of events) {
      element.dispatchEvent(new Event(eventName, { bubbles: true }));
    }
  }

  scrollIntoView(element: HTMLElement): void {
    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  focus(element: HTMLElement, variant: 'focus' | 'changed' = 'focus'): void {
    this.scrollIntoView(element);
    this.highlighter.highlight(element, variant);
    element.focus();
  }

  safeClick(element: HTMLElement): void {
    this.focus(element, 'focus');
    this.dispatchEvents(element, ['pointerdown', 'mousedown']);
    element.click();
    this.dispatchEvents(element, ['mouseup', 'pointerup']);
  }

  safeFill(element: HTMLElement, value: string): void {
    this.focus(element, 'changed');

    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      // Real DMed TinyEditor: update via the MedicalRecordsEditor JS API
      if (element instanceof HTMLTextAreaElement && element.id.startsWith('tinyeditor_')) {
        const editorKey = element.getAttribute('data-medrecid') ?? '0';
        const editors = (window as Record<string, unknown>)['MedicalRecordsEditor'] as
          | Record<string, { medicalRecord: (v?: string) => string }>
          | undefined;
        const editor = editors?.['md_' + editorKey];
        if (editor) {
          editor.medicalRecord(value);
          return;
        }
      }

      // Real DMed Kendo NumericTextBox: original input is hidden, update via Kendo API
      if (element.getAttribute('data-role') === 'numerictextbox') {
        const jq = (window as Record<string, unknown>)['jQuery'] as
          | ((selector: string) => { data: (key: string) => { value: (v: number) => void } | undefined })
          | undefined;
        const widget = jq?.('#' + element.id)?.data?.('kendoNumericTextBox');
        if (widget) {
          widget.value(Number(value));
          this.dispatchEvents(element, ['change']);
          return;
        }
      }

      element.value = value;
      this.dispatchEvents(element, ['input', 'change', 'blur']);
      return;
    }

    throw new Error('Element is not fillable');
  }

  safeSelect(element: HTMLElement, value: string): void {
    this.focus(element, 'changed');

    if (!(element instanceof HTMLSelectElement)) {
      throw new Error('Element is not selectable');
    }

    const option = Array.from(element.options).find((item) =>
      item.value.toLowerCase() === value.toLowerCase() || item.textContent?.toLowerCase().includes(value.toLowerCase()),
    );

    if (!option) {
      throw new Error(`Select option not found: ${value}`);
    }

    element.value = option.value;
    this.dispatchEvents(element, ['input', 'change', 'blur']);
  }
}
