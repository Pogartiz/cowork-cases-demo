# Cowork cases demo

Каталог интерактивных snapshot-кейсов Cowork для коллег.

Живые кейсы: **Реестр решений комитетов**, **BAF project**. Остальные из `ru_cowork_local` — заглушки «скоро».

**Snapshot** из канона Toolathlon (`cowork_cases/office/…`). Live-sync с пайплайном нет.

## URL

https://pogartiz.github.io/cowork-cases-demo/

Старый URL `cowork-committee-decisions-demo` после rename больше не используется. Локальный бэкап до переделки: `../cowork-committee-decisions-demo-backup/`.

## Локально

```bash
npm install
npm run content   # пересборка catalog / trees / previews / baf L2
npm run dev
```

Сборка:

```bash
npm run build
npm run preview
```

В `vite.config.ts`: `base: '/cowork-cases-demo/'` — нужно для GitHub Pages.

## Режимы

- **Агент** — shared context, задания, workspace.
- **Автор** — плюс expected, sources, ловушки, эталон L2.

Переключатель Агент/Автор — UX, не security boundary (репозиторий публичный).

## Кейсы

| Кейс | Статус | Особенности |
|------|--------|-------------|
| committee-decisions-register | live | тур 5 шагов, сверка L1 как в харнессе |
| baf-project | live | без тура; A/B на L1-05/L2-02; упрощённая сверка; лёгкие preview xlsx/docx |
| komandirovki-K24-audit и др. | stub | карточка «скоро» |

## Контент

```
content/
  catalog.json
  cases/<case-id>/
    workspace/
    workspace_variants/   # baf A/B overlays
    assignments/
    demo_meta.json
    derived/l2_preview.json
    derived/file_previews.json
    workspace_tree.json
```

```bash
python3 tools/build_demo_content.py
```

Для baf L2 derive читает канон `…/cowork_cases/office/baf-project/lib/l2_expected.py`.
