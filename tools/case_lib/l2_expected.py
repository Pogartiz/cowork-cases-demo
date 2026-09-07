"""Helpers to build expected L2 tables from scenario."""

from __future__ import annotations

from datetime import date
from typing import Any

from events import derive_states, state_after_event


TYPE_ORDER = {"Создание": 0, "Перенос": 1, "Отмена": 2}


def expected_registry_rows(scenario: dict[str, Any]) -> list[dict[str, str]]:
    states = derive_states(scenario)
    rows = []
    for did, st in states.items():
        rows.append(
            {
                "ID": did,
                "Комитет": st["committee"],
                "Решение": st["text"],
                "Ответственный": st["owner"],
                "Первоначальный срок": st["initial_deadline"],
                "Актуальный срок": st["current_deadline"],
                "Статус": st["status"],
                "Файлы-источники": "; ".join(st["source_chain"]),
            }
        )
    rows.sort(key=lambda r: (r["Актуальный срок"], r["ID"]))
    return rows


def expected_journal_rows(scenario: dict[str, Any]) -> list[dict[str, str]]:
    states = derive_states(scenario)
    cutoff = scenario["cutoff_date"]
    rows = []
    for did, st in states.items():
        applied = []
        for ev in st["events"]:
            applied.append(ev)
            after = state_after_event(st, applied, cutoff)
            rows.append(
                {
                    "ID": did,
                    "Дата события": ev["date"],
                    "Тип": ev["type"],
                    "Старое значение": "" if ev.get("old_value") is None else str(ev["old_value"]),
                    "Новое значение": "" if ev.get("new_value") is None else str(ev["new_value"]),
                    "Файл-источник": ev["file"],
                    "Состояние после события": after["status"],
                }
            )
    rows.sort(key=lambda r: (r["Дата события"], r["ID"], TYPE_ORDER[r["Тип"]]))
    return rows


def overdue_sorted(scenario: dict[str, Any]) -> list[tuple[str, int, str]]:
    states = derive_states(scenario)
    cut = date.fromisoformat(scenario["cutoff_date"])
    out = []
    for st in states.values():
        if st["status"] != "ПРОСРОЧЕНО":
            continue
        days = (cut - date.fromisoformat(st["current_deadline"])).days
        out.append((st["id"], days, st["current_deadline"]))
    out.sort(key=lambda x: (-x[1], x[0]))
    return out


def committee_summary(scenario: dict[str, Any]) -> list[tuple[str, int, int, int]]:
    states = derive_states(scenario)
    rows = []
    for c in scenario["committees"]:
        items = [s for s in states.values() if s["committee"] == c]
        total = len(items)
        overdue = sum(1 for s in items if s["status"] == "ПРОСРОЧЕНО")
        cancelled = sum(1 for s in items if s["cancelled"])
        rows.append((c, total, overdue, cancelled))
    return rows


def status_counts(scenario: dict[str, Any]) -> dict[str, int]:
    states = derive_states(scenario)
    return {
        "всего": len(states),
        "в работе": sum(1 for s in states.values() if s["status"] == "В работе"),
        "просрочено": sum(1 for s in states.values() if s["status"] == "ПРОСРОЧЕНО"),
        "отменено": sum(1 for s in states.values() if s["cancelled"]),
    }


def amended_ids(scenario: dict[str, Any]) -> list[str]:
    states = derive_states(scenario)
    return sorted(s["id"] for s in states.values() if s["amendment_count"] >= 1)


def cancelled_ids(scenario: dict[str, Any]) -> list[str]:
    states = derive_states(scenario)
    return sorted(s["id"] for s in states.values() if s["cancelled"])
