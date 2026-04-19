const HIGHLIGHT_CLASS = 'medflow-agent-highlight';
const CHANGED_HIGHLIGHT_CLASS = 'medflow-agent-highlight-changed';
type HighlightVariant = 'focus' | 'changed';

const ensureStyle = (): void => {
  if (document.getElementById('medflow-agent-highlight-style')) {
    return;
  }

  const style = document.createElement('style');
  style.id = 'medflow-agent-highlight-style';
  style.textContent = `
    @keyframes medflow-pulse-focus {
      0%   { box-shadow: 0 0 0 0 rgba(18, 165, 148, 0.45); }
      50%  { box-shadow: 0 0 0 7px rgba(18, 165, 148, 0.12); }
      100% { box-shadow: 0 0 0 11px rgba(18, 165, 148, 0); }
    }
    @keyframes medflow-pulse-changed {
      0%   { box-shadow: 0 0 0 0 rgba(17, 58, 52, 0.52); }
      45%  { box-shadow: 0 0 0 8px rgba(17, 58, 52, 0.16); }
      100% { box-shadow: 0 0 0 12px rgba(17, 58, 52, 0); }
    }
    .${HIGHLIGHT_CLASS} {
      outline: 2px solid #12A594 !important;
      outline-offset: 1px !important;
      animation: medflow-pulse-focus 0.72s ease-out forwards !important;
      transition: outline 0.15s ease, border-color 0.15s ease !important;
    }
    .${CHANGED_HIGHLIGHT_CLASS} {
      outline: 3px solid #113A34 !important;
      outline-offset: 1px !important;
      border-color: #113A34 !important;
      box-shadow: 0 0 0 2px rgba(17, 58, 52, 0.26) !important;
      background-color: rgba(17, 58, 52, 0.05) !important;
      animation: medflow-pulse-changed 0.82s ease-out forwards !important;
      transition: outline 0.15s ease, border-color 0.15s ease, background-color 0.15s ease !important;
    }
  `;
  document.head.appendChild(style);
};

export class Highlighter {
  highlight(element: Element, variant: HighlightVariant = 'focus'): void {
    ensureStyle();
    element.classList.remove(HIGHLIGHT_CLASS);
    element.classList.remove(CHANGED_HIGHLIGHT_CLASS);
    // Force reflow so removing+re-adding the class restarts the animation
    void (element as HTMLElement).offsetWidth;
    const className = variant === 'changed' ? CHANGED_HIGHLIGHT_CLASS : HIGHLIGHT_CLASS;
    element.classList.add(className);
    window.setTimeout(() => element.classList.remove(className), 1200);
  }
}
