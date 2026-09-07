# Cowork committee-decisions-demo

Интерактивное демо пилотного кейса «Реестр решений комитетов» для коллег.

**Snapshot** канона из Toolathlon (`cowork_cases/office/committee-decisions-register`). Кейс больше не обновляется — live-sync нет.

## URL

После деплоя Pages:

https://pogartiz.github.io/cowork-committee-decisions-demo/

## Локально

```bash
npm install
npm run dev
```

Сборка:

```bash
npm run build
npm run preview
```

Важно: в `vite.config.ts` задано `base: '/cowork-committee-decisions-demo/'` — нужно для GitHub Pages.

## Режимы

- **Агент** — то, что видит модель: shared context, задания, workspace.
- **Автор** — плюс expected, acceptable sources, ловушки, эталон L2.

## Контент

- `content/workspace/` — папка агента
- `content/assignments/` — task.md + expected (L1)
- `content/derived/l2_preview.json` — эталонные таблицы L2
- `tools/derive_l2_preview.py` — пересборка preview из `content/scenario.json`

```bash
python3 tools/derive_l2_preview.py
```

## Сверка L1

Семантика как в `lib/metrics.py` харнесса: `task_pass` не зависит от sources; sources — soft-метрики.
