import { translateByLocale, type AppLocale, type NavigationTarget } from '@hackathon/shared';

import { getStoredLocale } from '../i18n/localeStorage';
import { DomEngine } from '../modules/dom/domEngine';
import { PageInspector } from '../modules/dom/pageInspector';
import type { BackgroundToContentMessage, ContentExecutionResponse } from '../types/messages';

const PANEL_ROOT_ID = 'medflow-agent-panel-root';
const PANEL_IFRAME_ID = 'medflow-agent-panel-iframe';
const PANEL_LOADER_ID = 'medflow-agent-panel-loader';
const PANEL_READY_SOURCE = 'medflow-panel';
const PANEL_READY_TYPE = 'ready';
const PANEL_BOOT_TIMEOUT_MS = 2600;
const PANEL_MAX_RELOAD_ATTEMPTS = 1;
const PANEL_BOOT_ATTACHED_ATTR = 'data-medflow-boot-attached';

type PanelRuntime = {
  host: HTMLElement;
  iframe: HTMLIFrameElement;
  loader: HTMLElement;
  bootTimer: number | null;
  ready: boolean;
  reloadAttempts: number;
  createdAt: number;
};

const inspector = new PageInspector();
const engine = new DomEngine();
let panelRuntime: PanelRuntime | null = null;

const canInjectPanel = (): boolean => {
  if (window.top !== window) return false;
  if (location.protocol.startsWith('chrome-extension')) return false;
  return true;
};

const getPanelHost = (): HTMLElement | null => document.getElementById(PANEL_ROOT_ID);

const getPanelUrl = (): string => new URL(/* @vite-ignore */ 'panel.html', import.meta.url).toString();

const createLoader = (): HTMLElement => {
  const loader = document.createElement('div');
  loader.id = PANEL_LOADER_ID;
  loader.textContent = 'Loading AI agent...';
  loader.style.position = 'absolute';
  loader.style.inset = '0';
  loader.style.display = 'flex';
  loader.style.alignItems = 'center';
  loader.style.justifyContent = 'center';
  loader.style.padding = '16px';
  loader.style.background = 'linear-gradient(180deg, rgba(241,245,249,0.92) 0%, rgba(226,232,240,0.86) 100%)';
  loader.style.color = '#1f2937';
  loader.style.fontFamily = 'Manrope, ui-sans-serif, system-ui';
  loader.style.fontSize = '13px';
  loader.style.fontWeight = '600';
  loader.style.letterSpacing = '0.01em';
  loader.style.zIndex = '1';
  loader.style.pointerEvents = 'none';
  return loader;
};

const showIframe = (iframe: HTMLIFrameElement): void => {
  iframe.style.opacity = '1';
  iframe.style.pointerEvents = 'auto';
};

const hideIframe = (iframe: HTMLIFrameElement): void => {
  iframe.style.opacity = '0';
  iframe.style.pointerEvents = 'none';
};

const forceVisibleIframe = (iframe: HTMLIFrameElement): void => {
  iframe.style.visibility = 'visible';
  iframe.style.display = 'block';
  iframe.style.transform = 'translateZ(0)';
};

const clearPanelBootTimer = (): void => {
  if (!panelRuntime?.bootTimer) {
    return;
  }

  window.clearTimeout(panelRuntime.bootTimer);
  panelRuntime.bootTimer = null;
};

const markPanelReady = (): void => {
  if (!panelRuntime) {
    return;
  }

  panelRuntime.ready = true;
  clearPanelBootTimer();
  forceVisibleIframe(panelRuntime.iframe);
  showIframe(panelRuntime.iframe);
  panelRuntime.loader.remove();
};

const schedulePanelBootRecovery = (): void => {
  if (!panelRuntime) {
    return;
  }

  clearPanelBootTimer();
  panelRuntime.bootTimer = window.setTimeout(() => {
    if (!panelRuntime || panelRuntime.ready) {
      return;
    }

    if (panelRuntime.reloadAttempts >= PANEL_MAX_RELOAD_ATTEMPTS) {
      panelRuntime.loader.textContent = 'Panel did not initialize automatically. Click "Open agent panel" again.';
      forceVisibleIframe(panelRuntime.iframe);
      showIframe(panelRuntime.iframe);
      return;
    }

    panelRuntime.reloadAttempts += 1;
    panelRuntime.loader.textContent = 'Retrying panel bootstrap...';
    hideIframe(panelRuntime.iframe);
    panelRuntime.iframe.src = `${getPanelUrl()}?boot=${Date.now()}`;
    panelRuntime.createdAt = Date.now();
    schedulePanelBootRecovery();
  }, PANEL_BOOT_TIMEOUT_MS);
};

const attachIframeBootLifecycle = (iframe: HTMLIFrameElement): void => {
  if (iframe.getAttribute(PANEL_BOOT_ATTACHED_ATTR) === '1') {
    return;
  }

  iframe.setAttribute(PANEL_BOOT_ATTACHED_ATTR, '1');
  iframe.addEventListener('load', () => {
    if (panelRuntime?.ready) {
      markPanelReady();
    } else {
      schedulePanelBootRecovery();
    }
  });
};

const isPanelReadyMessage = (payload: unknown): payload is { source: string; type: string } =>
  payload !== null &&
  typeof payload === 'object' &&
  'source' in payload &&
  'type' in payload &&
  String((payload as { source: string }).source) === PANEL_READY_SOURCE &&
  String((payload as { type: string }).type) === PANEL_READY_TYPE;

const ensurePanel = (): HTMLElement => {
  if (panelRuntime?.host.isConnected) {
    return panelRuntime.host;
  }

  const existing = getPanelHost();
  if (existing) {
    const existingIframe = existing.querySelector<HTMLIFrameElement>(`#${PANEL_IFRAME_ID}`);
    const existingLoader = existing.querySelector<HTMLElement>(`#${PANEL_LOADER_ID}`);

    if (existingIframe) {
      existingIframe.id = PANEL_IFRAME_ID;
      existingIframe.style.border = 'none';
      existingIframe.style.width = '100%';
      existingIframe.style.height = '100%';
      existingIframe.style.transition = 'opacity 120ms ease';
      attachIframeBootLifecycle(existingIframe);

      const runtimeLoader = existingLoader ?? createLoader();
      if (existingLoader && !existing.contains(existingLoader)) {
        existing.appendChild(existingLoader);
      }

      panelRuntime = {
        host: existing,
        iframe: existingIframe,
        loader: runtimeLoader,
        bootTimer: null,
        ready: !existingLoader,
        reloadAttempts: 0,
        createdAt: Date.now(),
      };

      if (panelRuntime.ready) {
        forceVisibleIframe(existingIframe);
        showIframe(existingIframe);
      } else {
        hideIframe(existingIframe);
        schedulePanelBootRecovery();
      }
    }

    return existing;
  }

  const host = document.createElement('div');
  host.id = PANEL_ROOT_ID;
  host.style.position = 'fixed';
  host.style.top = '12px';
  host.style.right = '12px';
  host.style.width = '400px';
  host.style.height = 'calc(100vh - 24px)';
  host.style.zIndex = '2147483647';
  host.style.borderRadius = '16px';
  host.style.overflow = 'hidden';
  host.style.boxShadow = '0 20px 40px rgba(15, 23, 42, 0.25)';
  host.style.background = '#f1f5f9';
  host.style.display = 'block';
  host.style.isolation = 'isolate';

  const loader = createLoader();

  const iframe = document.createElement('iframe');
  iframe.id = PANEL_IFRAME_ID;
  iframe.src = getPanelUrl();
  iframe.allow = 'microphone';
  iframe.style.border = 'none';
  iframe.style.width = '100%';
  iframe.style.height = '100%';
  forceVisibleIframe(iframe);
  hideIframe(iframe);
  iframe.style.transition = 'opacity 120ms ease';
  iframe.title = 'MedFlow Agent Panel';
  iframe.loading = 'eager';
  attachIframeBootLifecycle(iframe);

  host.appendChild(loader);
  host.appendChild(iframe);
  document.body.appendChild(host);

  panelRuntime = {
    host,
    iframe,
    loader,
    bootTimer: null,
    ready: false,
    reloadAttempts: 0,
    createdAt: Date.now(),
  };
  schedulePanelBootRecovery();

  return host;
};

const focusPanel = (): boolean => {
  if (!canInjectPanel()) {
    return false;
  }

  const host = ensurePanel();
  host.style.display = 'block';
  host.style.opacity = '1';
  // Force layout pass to avoid sporadic Edge stale paint for extension iframes.
  host.getBoundingClientRect();

  if (panelRuntime) {
    if (panelRuntime.ready) {
      forceVisibleIframe(panelRuntime.iframe);
      showIframe(panelRuntime.iframe);
    } else {
      schedulePanelBootRecovery();
    }
  }

  host.scrollIntoView({ behavior: 'smooth', block: 'start' });
  return true;
};

const keepPanelHealthy = (): void => {
  const host = getPanelHost();
  if (!host || host.style.display === 'none') {
    return;
  }

  const iframe = host.querySelector<HTMLIFrameElement>(`#${PANEL_IFRAME_ID}`);
  if (!iframe) {
    return;
  }

  forceVisibleIframe(iframe);
  host.getBoundingClientRect();

  if (panelRuntime?.ready) {
    showIframe(iframe);
    return;
  }

  const ageMs = panelRuntime ? Date.now() - panelRuntime.createdAt : 0;
  if (panelRuntime && ageMs > PANEL_BOOT_TIMEOUT_MS + 1200) {
    panelRuntime.iframe = iframe;
    schedulePanelBootRecovery();
  }
};

const panelVisible = (): boolean => {
  const host = getPanelHost();
  if (!host) {
    return false;
  }
  return host.style.display !== 'none';
};

const isSupportedPage = (): boolean => inspector.detect() !== 'unknown';

const run = async (message: BackgroundToContentMessage): Promise<ContentExecutionResponse> => {
  const locale: AppLocale = await getStoredLocale();
  const t = (key: string, params?: Record<string, string | number>) => translateByLocale(locale, key, params);

  try {
    if (message.type === 'CONTENT_GET_PAGE_STATE') {
      const pageType = inspector.detect();
      return {
        success: true,
        title: t('content.pageState.title'),
        details: pageType === 'unknown' ? t('content.pageState.details') : undefined,
        pageType,
        supported: pageType !== 'unknown',
        panelVisible: panelVisible(),
      };
    }

    if (message.type === 'CONTENT_OPEN_PANEL') {
      if (!canInjectPanel()) {
        return {
          success: false,
          title: t('content.panel.unavailable'),
          details: t('content.panel.unavailableDetails'),
          pageType: inspector.detect(),
          supported: false,
          panelVisible: false,
        };
      }

      const opened = focusPanel();
      return {
        success: opened,
        title: opened ? t('content.panel.opened') : t('content.panel.unavailable'),
        details: opened ? t('content.panel.openedDetails') : t('content.panel.openError'),
        pageType: inspector.detect(),
        supported: isSupportedPage(),
        panelVisible: opened,
      };
    }

    if (message.type === 'CONTENT_NAVIGATE') {
      const result = await engine.navigate(message.payload.target as NavigationTarget, locale, message.payload.recordType);
      return {
        success: true,
        title: result.title,
        details: result.details,
        pageType: engine.inspectPage(),
        supported: true,
        panelVisible: panelVisible(),
      };
    }

    if (message.type === 'CONTENT_FILL_PRIMARY') {
      const result = await engine.fillPrimaryExam(message.payload.data, locale);
      return {
        success: true,
        title: result.title,
        details: result.details,
        pageType: engine.inspectPage(),
        supported: true,
        panelVisible: panelVisible(),
      };
    }

    if (message.type === 'CONTENT_GET_PATIENT_INFO') {
      return {
        success: true,
        title: 'Patient info',
        pageType: engine.inspectPage(),
        supported: true,
        panelVisible: panelVisible(),
        patientInfo: engine.extractPatientInfo(),
      };
    }

    if (message.type === 'CONTENT_FILL_DISCHARGE') {
      const result = await engine.fillDischargeSummary(
        message.payload.text,
        locale,
        message.payload.dischargeDate,
        message.payload.outcome,
      );
      return {
        success: true,
        title: result.title,
        details: result.details,
        pageType: engine.inspectPage(),
        supported: true,
        panelVisible: panelVisible(),
      };
    }

    if (message.type === 'CONTENT_FILL_DIARY') {
      const result = await engine.fillDiaryNote(
        message.payload.text,
        message.payload.vitals,
        locale,
        message.payload.entryDate,
      );
      return {
        success: true,
        title: result.title,
        details: result.details,
        pageType: engine.inspectPage(),
        supported: true,
        panelVisible: panelVisible(),
      };
    }

    if (message.type === 'CONTENT_APPLY_SCHEDULE') {
      const result = await engine.applySchedule(message.payload.schedule, locale);
      return {
        success: true,
        title: result.title,
        details: result.details,
        pageType: engine.inspectPage(),
        supported: true,
        panelVisible: panelVisible(),
      };
    }

    if (message.type === 'CONTENT_COMPLETE_SERVICE') {
      const result = await engine.completeService(message.payload.note, locale, message.payload.procedureName);
      return {
        success: true,
        title: result.title,
        details: result.details,
        pageType: engine.inspectPage(),
        supported: true,
        panelVisible: panelVisible(),
      };
    }

    if (message.type === 'CONTENT_OPEN_DIARY') {
      const result = await engine.navigate('treatment_diary', locale);
      return {
        success: true,
        title: result.title,
        details: result.details,
        pageType: engine.inspectPage(),
        supported: true,
        panelVisible: panelVisible(),
      };
    }

    if (message.type === 'CONTENT_INSPECT_CONTEXT') {
      return {
        success: true,
        title: t('content.context.title'),
        details: t('content.context.details'),
        pageType: engine.inspectPage(),
        supported: isSupportedPage(),
        panelVisible: panelVisible(),
        context: engine.extractScheduleContext(locale),
      };
    }

    if (message.type === 'CONTENT_SCAN_DOM') {
      return {
        success: true,
        title: 'DOM snapshot',
        pageType: engine.inspectPage(),
        supported: isSupportedPage(),
        panelVisible: panelVisible(),
        domSnapshot: engine.scanPage(),
      };
    }

    if (message.type === 'CONTENT_SMART_EXECUTE') {
      const result = await engine.executeActions(message.payload.actions, locale);
      return {
        success: result.count > 0,
        title: result.title,
        details: result.details,
        pageType: engine.inspectPage(),
        supported: true,
        panelVisible: panelVisible(),
      };
    }

    if (message.type === 'CONTENT_SAVE_FORM') {
      const result = engine.saveCurrentForm(locale);
      return {
        success: true,
        title: result.title,
        details: result.details,
        pageType: engine.inspectPage(),
        supported: true,
        panelVisible: panelVisible(),
      };
    }

    if (message.type === 'CONTENT_GENERATE_DOCUMENT') {
      const result = await engine.generateDocument(locale);
      return {
        success: true,
        title: result.title,
        details: result.details,
        pageType: engine.inspectPage(),
        supported: true,
        panelVisible: panelVisible(),
      };
    }

    return {
      success: false,
      title: t('content.unsupportedCommand'),
      details: t('content.unsupportedCommandDetails'),
      pageType: engine.inspectPage(),
      supported: isSupportedPage(),
      panelVisible: panelVisible(),
    };
  } catch (error) {
    return {
      success: false,
      title: t('content.domError'),
      details: error instanceof Error ? error.message : String(error),
      pageType: engine.inspectPage(),
      supported: isSupportedPage(),
      panelVisible: panelVisible(),
    };
  }
};

window.addEventListener('message', (event: MessageEvent) => {
  if (!panelRuntime) {
    return;
  }

  if (isPanelReadyMessage(event.data)) {
    markPanelReady();
  }
});

window.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    keepPanelHealthy();
  }
});

window.addEventListener('pageshow', () => {
  keepPanelHealthy();
});

window.setInterval(() => {
  keepPanelHealthy();
}, 1500);

chrome.runtime.onMessage.addListener((message: BackgroundToContentMessage, _sender, sendResponse) => {
  run(message)
    .then((result) => sendResponse(result))
    .catch(async (error) => {
      const locale = await getStoredLocale();
      sendResponse({
        success: false,
        title: translateByLocale(locale, 'content.unhandledError'),
        details: error instanceof Error ? error.message : String(error),
        pageType: inspector.detect(),
        supported: isSupportedPage(),
        panelVisible: panelVisible(),
      } satisfies ContentExecutionResponse);
    });

  return true;
});

// Panel is NOT auto-injected on page load.
// It can be opened manually via the popup's "Launch Panel" button.
