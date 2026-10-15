# Cowork cases demo

Каталог интерактивных snapshot-кейсов Cowork для коллег.

Живые кейсы: **Реестр решений комитетов**, **BAF project**, **Командировки K24**, **QC-релиз лабораторных проб**. Остальные из `ru_cowork_local` — заглушки «скоро».

**Snapshot** из канона Toolathlon (`cowork_cases/office/…`). Live-sync с пайплайном нет.

## URL

https://pogartiz.github.io/cowork-cases-demo/

Старый URL `cowork-committee-decisions-demo` после rename больше не используется. Локальный бэкап до переделки: `../cowork-committee-decisions-demo-backup/`.

## Локально

```bash
npm install
npm run content   # пересборка catalog / trees / previews / L2 (baf, k24, lab)
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
| baf-project | live | без тура; A/B на L1-05/L2-02; preview xlsx/docx |
| komandirovki-K24-audit | live | без тура; A/B на L1-03/05, L2-01/02/04; preview pdf/xlsx/docx |
| lab-sample-qc-release | live | без тура; A/B на L1-02/05, L2-01…04; preview pdf/xlsx/docx/csv |
| supply-contract-PS17-claims, trip_audit | stub | карточка «скоро» |

## Контент

```
content/
  catalog.json
  cases/<case-id>/
    workspace/
    workspace_variants/   # A/B overlays (baf, k24, lab)
    assignments/
    demo_meta.json
    derived/l2_preview.json
    derived/file_previews.json
    workspace_tree.json
```

```bash
python3 tools/build_demo_content.py
```

L2 derive для baf/k24/lab читает канон `…/cowork_cases/office/<case>/lib/l2_expected.py`.
