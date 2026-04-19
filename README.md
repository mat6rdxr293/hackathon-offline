# MedFlow AI Agent MVP (Hackathon)

Полноценный MVP внешнего AI/RPA-слоя для медицинского веб-интерфейса на базе Chrome Extension Manifest V3.

## Что реализовано

- Monorepo на `pnpm workspace`.
- `apps/extension`: Chrome Extension MV3 (`React + Vite + Tailwind + Zustand + zod`).
- `apps/server`: backend (`Fastify + TypeScript + zod + dayjs + uuid`).
- `packages/shared`: общие типы/схемы/константы.
- `mock/pages`: локальные mock-страницы медицинской системы.
- Реальный DOM automation слой (поиск + fallback + click/fill/select + retries + events + highlight).
- Voice input через Web Speech API.
- Workflow state machine + next-step suggestions.
- Scheduler на 9 рабочих дней с детерминированным размещением без конфликтов.
- Fallback-режим без LLM API key.

## Структура проекта

```text
apps/
  extension/
  server/
packages/
  shared/
mock/
  pages/
  assets/
```

## Установка

```bash
pnpm install
```

## Запуск backend

```bash
pnpm --filter @hackathon/server dev
```

Проверка:

```bash
curl http://127.0.0.1:8787/api/health
```

## Сборка extension

```bash
pnpm --filter @hackathon/extension build
```

Артефакты: `apps/extension/dist`.

## Загрузка extension в Chrome

1. Откройте `chrome://extensions`.
2. Включите `Developer mode`.
3. Нажмите `Load unpacked`.
4. Выберите папку `apps/extension/dist`.
5. Для `file://` страниц включите `Allow access to file URLs` для расширения.
6. Popup-режим доступен по клику на иконку расширения (быстрые команды + запуск full panel).

## Открытие mock pages

Вариант 1 (рекомендуется): локальный HTTP-сервер

```bash
npx serve mock -l 4173
```

Открыть:
- `http://127.0.0.1:4173/pages/patients.html`
- `http://127.0.0.1:4173/pages/patient-card.html`

Вариант 2: напрямую `file:///.../mock/pages/patient-card.html`.

## Demo flow

1. Запустить backend (`pnpm --filter @hackathon/server dev`).
2. Загрузить extension из `apps/extension/dist`.
3. Открыть `mock/pages/patient-card.html`.
4. В правой панели агента:
   - Нажать микрофон или ввести команду текстом.
   - Команды обрабатываются backend -> DOM actions -> лог/UI.
5. Альтернатива: нажать иконку extension и использовать popup control center.

## Поддерживаемые команды (минимум)

- `Открой первичный прием`
- `Открой дневник`
- `Сформируй расписание процедур`
- `Отметь услугу выполненной`
- диктовка для первичного осмотра:
  - `Жалобы ... объективно ... рекомендован ...`

## API endpoints

- `POST /api/intent/parse`
- `POST /api/medical/parse`
- `POST /api/schedule/generate`
- `POST /api/workflow/next-step`
- `GET /api/health`

## LLM key (optional)

Система работает без ключа (fallback).

Для optional provider parsing:

```bash
set LLM_API_KEY=your_key
set LLM_API_URL=https://api.openai.com/v1/chat/completions
set LLM_MODEL=gpt-4o-mini
pnpm --filter @hackathon/server dev
```

## Как работает fallback без API key

- Intent parsing: keyword-based parser.
- Medical parsing: heuristic local parser.
- Workflow/scheduler: полностью локальная логика.

## Полезные команды

```bash
pnpm -r build
pnpm -r typecheck
pnpm --filter @hackathon/server start
```

## Ограничения MVP

- Mock DOM и selector-слой заточены под локальные страницы `mock/pages`.
- Реальный production DamuMed потребует адаптации maps/synonyms/selectors.

## ElevenLabs TTS (extension)

The extension TTS now uses ElevenLabs first, with OpenAI/Web Speech as fallback.

Set in `apps/extension/src/constants/api.ts`:

- `ELEVENLABS_API_KEY`
- optional `ELEVENLABS_TTS_VOICE_ID` (recommended)
- optional `ELEVENLABS_TTS_VOICE_NAME` (default: `Alan - Soft, Hasty and Warm`)
- model: `eleven_multilingual_v2`
- output format: `mp3_44100_128`
- voice settings:
  - speed: `0.8`
  - stability: `0.95`
  - similarity_boost: `0.95`
  - style: `0.35`
  - use_speaker_boost: `true`
