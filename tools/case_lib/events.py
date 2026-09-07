"""Event model and derived decision state from scenario.json."""

from __future__ import annotations

from copy import deepcopy
from typing import Any


CUTOFF_DEFAULT = "2026-08-18"
STATUS_CANCELLED = "ОТМЕНЕНО"
STATUS_OVERDUE = "ПРОСРОЧЕНО"
STATUS_IN_PROGRESS = "В работе"


class ScenarioError(ValueError):
    pass


def validate_event_model(scenario: dict[str, Any]) -> None:
    """Enforce terminal cancellation and unique meeting dates."""
    dates = [p["date"] for p in scenario["protocols"]]
    if len(dates) != len(set(dates)):
        raise ScenarioError("protocol meeting dates must be unique")

    events = sorted(scenario["events"], key=lambda e: (e["date"], e["file"], e["type"]))
    cancelled_at: dict[str, str] = {}
    for ev in events:
        did = ev["decision_id"]
        if did in cancelled_at and ev["type"] in ("Перенос", "Создание", "Отмена"):
            if ev["date"] > cancelled_at[did] or (
                ev["date"] == cancelled_at[did] and ev["type"] != "Отмена"
            ):
                raise ScenarioError(
                    f"event after cancellation for {did}: {ev}"
                )
        if ev["type"] == "Отмена":
            if did in cancelled_at:
                raise ScenarioError(f"duplicate cancellation for {did}")
            cancelled_at[did] = ev["date"]


def derive_states(scenario: dict[str, Any]) -> dict[str, dict[str, Any]]:
    """Compute current deadline, status, source chain per decision from events."""
    validate_event_model(scenario)
    cutoff = scenario["cutoff_date"]
    by_id = {d["id"]: deepcopy(d) for d in scenario["decisions"]}
    for d in by_id.values():
        d["current_deadline"] = d["initial_deadline"]
        d["cancelled"] = False
        d["source_chain"] = []
        d["amendment_count"] = 0
        d["events"] = []

    events = sorted(scenario["events"], key=lambda e: (e["date"], e["file"], e["type"]))
    for ev in events:
        did = ev["decision_id"]
        if did not in by_id:
            raise ScenarioError(f"unknown decision in event: {did}")
        st = by_id[did]
        if st["cancelled"]:
            raise ScenarioError(f"event on cancelled decision {did}: {ev}")
        st["events"].append(ev)
        if ev["file"] not in st["source_chain"]:
            st["source_chain"].append(ev["file"])
        if ev["type"] == "Создание":
            st["current_deadline"] = ev.get("new_value") or st["initial_deadline"]
        elif ev["type"] == "Перенос":
            st["current_deadline"] = ev["new_value"]
            st["amendment_count"] += 1
        elif ev["type"] == "Отмена":
            st["cancelled"] = True

    for st in by_id.values():
        if st["cancelled"]:
            st["status"] = STATUS_CANCELLED
        elif st["current_deadline"] < cutoff:
            st["status"] = STATUS_OVERDUE
        else:
            st["status"] = STATUS_IN_PROGRESS
    return by_id


def state_after_event(
    decision: dict[str, Any], events_through: list[dict[str, Any]], cutoff: str
) -> dict[str, Any]:
    """Project state after applying events_through (prefix of decision events)."""
    deadline = decision["initial_deadline"]
    cancelled = False
    for ev in events_through:
        if ev["type"] == "Создание":
            deadline = ev.get("new_value") or deadline
        elif ev["type"] == "Перенос":
            deadline = ev["new_value"]
        elif ev["type"] == "Отмена":
            cancelled = True
    if cancelled:
        status = STATUS_CANCELLED
    elif deadline < cutoff:
        status = STATUS_OVERDUE
    else:
        status = STATUS_IN_PROGRESS
    return {"deadline": deadline, "cancelled": cancelled, "status": status}
