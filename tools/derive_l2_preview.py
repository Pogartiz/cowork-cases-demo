#!/usr/bin/env python3
"""Build content/derived/l2_preview.json from scenario snapshot.

Run from demo repo root:
  python3 tools/derive_l2_preview.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(Path(__file__).resolve().parent / "case_lib"))

from events import derive_states  # noqa: E402
from l2_expected import (  # noqa: E402
    amended_ids,
    cancelled_ids,
    committee_summary,
    expected_journal_rows,
    expected_registry_rows,
    overdue_sorted,
    status_counts,
)


def main() -> None:
    scenario_path = ROOT / "content" / "scenario.json"
    if not scenario_path.is_file():
        print(f"FAIL: missing {scenario_path}", file=sys.stderr)
        sys.exit(1)
    scenario = json.loads(scenario_path.read_text(encoding="utf-8"))
    # warm validate
    derive_states(scenario)

    overdue = [
        {"id": did, "days_overdue": days, "deadline": deadline}
        for did, days, deadline in overdue_sorted(scenario)
    ]
    committees = [
        {
            "committee": name,
            "total": total,
            "overdue": overdue_n,
            "cancelled": cancelled_n,
        }
        for name, total, overdue_n, cancelled_n in committee_summary(scenario)
    ]

    preview = {
        "L2-01": {
            "artifact": "output/реестр_решений.xlsx",
            "sheet": "Реестр",
            "columns": [
                "ID",
                "Комитет",
                "Решение",
                "Ответственный",
                "Первоначальный срок",
                "Актуальный срок",
                "Статус",
                "Файлы-источники",
            ],
            "rows": expected_registry_rows(scenario),
            "checklist": [
                "Один лист «Реестр»",
                "Строго заданные колонки",
                "Статусы по регламенту на дату среза",
                "Файлы-источники через «; » в порядке цепочки",
                "Сортировка: актуальный срок ↑, затем ID",
            ],
        },
        "L2-02": {
            "artifact": "output/журнал_изменений.xlsx",
            "sheet": "Журнал",
            "columns": [
                "ID",
                "Дата события",
                "Тип",
                "Старое значение",
                "Новое значение",
                "Файл-источник",
                "Состояние после события",
            ],
            "rows": expected_journal_rows(scenario),
            "checklist": [
                "Одна строка на событие",
                "Тип: Создание / Перенос / Отмена",
                "Состояние после события — на ту же дату среза",
                "Сортировка: дата, ID, тип (Создание < Перенос < Отмена)",
            ],
        },
        "L2-03": {
            "artifact": "output/отчёт_исключения.docx",
            "checklist": [
                "Заголовок: «Отчёт по исключениям на 2026-08-18»",
                "Раздел «Просроченные решения» — ID и сроки, дни просрочки ↓ затем ID ↑",
                "Раздел «Отменённые решения»",
                "Раздел «Решения с переносом срока»",
                "Раздел «Сводка по комитетам»: всего / просрочено / отменено",
                "Без субъективных рекомендаций",
            ],
            "overdue": overdue,
            "cancelled_ids": cancelled_ids(scenario),
            "amended_ids": amended_ids(scenario),
            "committee_summary": committees,
        },
        "L2-04": {
            "artifact": "output/справка_руководителю.pptx",
            "slides": 4,
            "checklist": [
                "Ровно 4 слайда",
                "«Общий статус» — всего / в работе / просрочено / отменено",
                "«Статус по комитетам»",
                "«Топ-5 просроченных»",
                "«Переносы и отмены»",
            ],
            "status_counts": status_counts(scenario),
            "committee_summary": committees,
            "top5_overdue": overdue[:5],
            "amended_ids": amended_ids(scenario),
            "cancelled_ids": cancelled_ids(scenario),
        },
    }

    out = ROOT / "content" / "derived" / "l2_preview.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(preview, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
