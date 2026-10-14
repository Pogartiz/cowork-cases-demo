#!/usr/bin/env python3
"""Build catalog, workspace trees, file previews, baf demo_meta and L2 derived."""

from __future__ import annotations

import csv
import io
import json
import re
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
CONTENT = ROOT / "content"
CASES = CONTENT / "cases"
CANON = Path(
    "/Users/admin/projects/sreda/toolathlon-memory-first-case/cowork_cases/office"
)

# Prefer openpyxl / python-docx when present
try:
    from openpyxl import load_workbook
except ImportError:
    load_workbook = None  # type: ignore

try:
    from docx import Document
except ImportError:
    Document = None  # type: ignore


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def build_tree(workspace: Path, prefix: str = "") -> dict[str, Any]:
    name = workspace.name if not prefix else Path(prefix).name or workspace.name

    def walk(dir_path: Path, rel: str) -> dict[str, Any]:
        children: list[dict[str, Any]] = []
        entries = sorted(dir_path.iterdir(), key=lambda p: (p.is_file(), p.name.lower()))
        for p in entries:
            if p.name.startswith("."):
                continue
            child_rel = f"{rel}/{p.name}" if rel else p.name
            if p.is_dir():
                children.append(walk(p, child_rel))
            else:
                children.append({"name": p.name, "path": child_rel, "type": "file"})
        return {
            "name": dir_path.name if rel else "workspace",
            "path": rel,
            "type": "dir",
            "children": children,
        }

    return walk(workspace, "")


def xlsx_preview(path: Path, max_rows: int = 40, max_cols: int = 12) -> dict[str, Any] | None:
    if load_workbook is None:
        return None
    try:
        wb = load_workbook(path, data_only=True, read_only=True)
    except Exception as e:
        return {"error": str(e)}
    sheets = []
    for name in wb.sheetnames[:4]:
        ws = wb[name]
        rows: list[list[str]] = []
        for i, row in enumerate(ws.iter_rows(values_only=True)):
            if i >= max_rows:
                break
            cells = ["" if c is None else str(c) for c in row[:max_cols]]
            if any(cells):
                rows.append(cells)
        sheets.append({"name": name, "rows": rows})
    wb.close()
    return {"kind": "xlsx", "sheets": sheets}


def docx_preview(path: Path, max_chars: int = 4000) -> dict[str, Any] | None:
    if Document is None:
        return None
    try:
        doc = Document(str(path))
        parts = [p.text for p in doc.paragraphs if p.text.strip()]
        text = "\n".join(parts)
        if len(text) > max_chars:
            text = text[:max_chars] + "\n…"
        return {"kind": "docx", "text": text}
    except Exception as e:
        return {"kind": "docx", "error": str(e)}


def csv_preview(path: Path, max_rows: int = 40) -> dict[str, Any]:
    text = path.read_text(encoding="utf-8", errors="replace")
    reader = csv.reader(io.StringIO(text))
    rows = []
    for i, row in enumerate(reader):
        if i >= max_rows:
            break
        rows.append(row)
    return {"kind": "csv", "rows": rows}


def txt_preview(path: Path, max_chars: int = 6000) -> dict[str, Any]:
    text = path.read_text(encoding="utf-8", errors="replace")
    if len(text) > max_chars:
        text = text[:max_chars] + "\n…"
    return {"kind": "text", "text": text}


def build_file_previews(case_dir: Path) -> dict[str, Any]:
    workspace = case_dir / "workspace"
    previews: dict[str, Any] = {}
    for path in workspace.rglob("*"):
        if not path.is_file():
            continue
        rel = str(path.relative_to(workspace)).replace("\\", "/")
        suf = path.suffix.lower()
        if suf == ".xlsx":
            p = xlsx_preview(path)
            if p:
                previews[rel] = p
        elif suf == ".docx":
            p = docx_preview(path)
            if p:
                previews[rel] = p
        elif suf == ".csv":
            previews[rel] = csv_preview(path)
        elif suf in {".txt", ".md"}:
            # md served as text in app; still ok to skip md (fetched raw)
            if suf == ".txt":
                previews[rel] = txt_preview(path)
    # Also preview B-variant overlays
    variants = case_dir / "workspace_variants"
    if variants.exists():
        for var in ("A", "B"):
            vdir = variants / var
            if not vdir.exists():
                continue
            for path in vdir.rglob("*"):
                if not path.is_file():
                    continue
                rel = str(path.relative_to(vdir)).replace("\\", "/")
                key = f"variant:{var}:{rel}"
                if path.suffix.lower() == ".xlsx":
                    p = xlsx_preview(path)
                    if p:
                        previews[key] = p
    return previews


def task_short(task_md: str) -> str:
    # Prefer first non-empty line under "## Текущее задание"
    m = re.search(r"## Текущее задание\s*\n+(.+)", task_md)
    if m:
        line = m.group(1).strip().lstrip("#").strip()
        line = re.sub(r"\*\*(.+?)\*\*", r"\1", line)
        if len(line) > 90:
            line = line[:87] + "…"
        return line
    for line in task_md.splitlines():
        line = line.strip()
        if line and not line.startswith("#"):
            return line[:90]
    return "Задание"


BAF_SHORTS = {
    "L1-01": "Концентрация pKB-dCas9 (15.07.2025)",
    "L1-02": "Удачные KD-линии по порогам",
    "L1-03": "Разведение Ab со скана геля",
    "L1-04": "Пик лактата CHO",
    "L1-05": "Дни значимой разности глюкозы",
    "L1-06": "Титр puro_1 (отказ)",
    "L1-07": "Микоплазма сент. 2026 (отказ)",
    "L1-08": "Разведение Ab (vision)",
    "L2-01": "График продуктивности puro_2",
    "L2-02": "График глюкозы lenti",
    "L2-03": "Сводка трансфекций.xlsx",
    "L2-04": "ИФА puro_3.xlsx",
}

BAF_TRAPS = {
    "L1-01": "versions",
    "L1-02": "rule_in_text",
    "L1-03": "scan_only_fact",
    "L1-04": None,
    "L1-05": "minimal_pair",
    "L1-06": "unanswerable",
    "L1-07": "unanswerable",
    "L1-08": "scan_only_fact",
    "L2-01": None,
    "L2-02": "minimal_pair",
    "L2-03": None,
    "L2-04": "distractor_twin",
}


def build_baf_demo_meta(case_dir: Path) -> dict[str, Any]:
    meta = json.loads((case_dir / "meta.json").read_text(encoding="utf-8"))
    assignments = []
    for aid in [
        "L1-01",
        "L1-02",
        "L1-03",
        "L1-04",
        "L1-05",
        "L1-06",
        "L1-07",
        "L1-08",
        "L2-01",
        "L2-02",
        "L2-03",
        "L2-04",
    ]:
        exp_path = case_dir / "assignments" / aid / "expected.json"
        exp = json.loads(exp_path.read_text(encoding="utf-8")) if exp_path.exists() else {}
        level = "L1" if aid.startswith("L1") else "L2"
        assignments.append(
            {
                "id": aid,
                "level": level,
                "skill": exp.get("skill") or ("artifact" if level == "L2" else "retrieval"),
                "trap": BAF_TRAPS.get(aid),
                "short": BAF_SHORTS.get(aid, aid),
                "has_variants": aid in ("L1-05", "L2-02"),
            }
        )
    return {
        "title": "BAF project (ARID1A)",
        "case_id": "baf-project",
        "cutoff_date": meta["cutoff_date"],
        "organization": meta.get("organization", ""),
        "default_mode": "agent",
        "eval_mode": "simple",
        "tour": [],
        "variant_files": [
            "Культивирование/CHOK1-arid-kd-lenti_2_глюкоза.xlsx",
            "Культивирование/сводка_метаболитов.xlsx",
        ],
        "variant_hint": {
            "B": "Вариант B: в глюкозе lenti_2 день 3 изменён (4.70 → 4.40) + сводка метаболитов."
        },
        "assignments": assignments,
        "trap_labels": {
            "versions": "Версии протоколов",
            "rule_in_text": "Правило в СОП/отчёте",
            "scan_only_fact": "Факт только со скана",
            "unanswerable": "Неотвечаемый вопрос",
            "minimal_pair": "Минимальная пара A/B",
            "distractor_twin": "Дистрактор-двойник",
        },
        "skill_labels": {
            "versions": "Версии",
            "rules": "Правила",
            "retrieval": "Поиск",
            "multi_format": "Мультиформат",
            "refusal": "Отказ",
            "vision": "Vision / скан",
            "rule_in_doc": "Правило в документе",
            "artifact_chart": "Артефакт: график",
            "artifact_reconciliation": "Артефакт: сводка",
            "artifact_twin": "Артефакт: twin-файл",
            "artifact": "Артефакт",
        },
    }


def build_baf_l2_preview(case_dir: Path) -> dict[str, Any]:
    # Import l2_expected from canon if possible
    sys.path.insert(0, str(CANON / "baf-project"))
    from lib.l2_expected import (  # type: ignore
        elisa_puro_3,
        glucose_lenti_2_means,
        glucose_lenti_4_means,
        kd_rows,
        productivity_peak_day,
        productivity_values,
        significant_days,
        successful_lines,
        failed_lines,
    )

    scenario = json.loads((case_dir / "scenario.json").read_text(encoding="utf-8"))
    prod = productivity_values(scenario)
    elisa = elisa_puro_3(scenario)
    kd = kd_rows(scenario)

    out: dict[str, Any] = {
        "L2-01": {
            "artifact": "output/продуктивность_puro_2.png",
            "sidecar": "output/продуктивность_puro_2.json",
            "checklist": [
                "PNG графика удельной продуктивности puro_2",
                "JSON sidecar с дневными значениями (мкг / 10⁶ клеток)",
                "Визуал осей не автооценён в харнессе",
            ],
            "values": prod,
            "peak_day": productivity_peak_day(scenario),
            "note": "Упрощённый эталон чисел (не полный judge).",
        },
        "L2-02": {
            "artifact": "output/глюкоза_lenti.png",
            "sidecar": "output/глюкоза_lenti.json",
            "checklist": [
                "PNG графика глюкозы lenti_2 vs lenti_4",
                "Подпись: разность > 5% / превышает 5%",
                "Значимые дни зависят от варианта A/B",
            ],
            "by_variant": {
                "A": {
                    "lenti_2_means": glucose_lenti_2_means(scenario, "A"),
                    "lenti_4_means": glucose_lenti_4_means(scenario),
                    "significant_days": significant_days(scenario, "A"),
                },
                "B": {
                    "lenti_2_means": glucose_lenti_2_means(scenario, "B"),
                    "lenti_4_means": glucose_lenti_4_means(scenario),
                    "significant_days": significant_days(scenario, "B"),
                },
            },
            "note": "Упрощённый эталон; task_pass в харнессе = png ∧ data.",
        },
        "L2-03": {
            "artifact": "output/сводка_трансфекций.xlsx",
            "sheet": "Сводка",
            "checklist": [
                "Лист «Сводка»",
                "Строки KD-линий со статусом удачно/неудачно по порогам RFP/eGFP",
            ],
            "columns": ["line", "rfp", "egfp", "status"],
            "rows": [
                {
                    "line": r["line"],
                    "rfp": str(r["rfp"]),
                    "egfp": str(r["egfp"]),
                    "status": r["status"],
                }
                for r in kd
            ],
            "successful": successful_lines(scenario),
            "failed": failed_lines(scenario),
        },
        "L2-04": {
            "artifact": "output/ифа_puro_3.xlsx",
            "sheet": "ИФА",
            "checklist": [
                "Источник: правильный twin-файл OD (не distractor)",
                "Лист «ИФА», значения puro_3 и среднее",
            ],
            "values": elisa["values"],
            "mean": elisa["mean"],
            "line": elisa["line"],
        },
    }
    return out


def build_catalog() -> dict[str, Any]:
    cases = []

    def live(case_id: str, title: str, org: str, cutoff: str, counts: dict) -> dict:
        return {
            "id": case_id,
            "title": title,
            "organization": org,
            "cutoff_date": cutoff,
            "status": "live",
            "assignment_counts": counts,
        }

    def stub(case_id: str) -> dict:
        m = json.loads((CANON / case_id / "meta.json").read_text(encoding="utf-8"))
        return {
            "id": case_id,
            "title": case_id,
            "organization": m.get("organization", ""),
            "cutoff_date": m.get("cutoff_date", ""),
            "status": "stub",
            "assignment_counts": m.get("assignment_counts", {}),
        }

    c_meta = json.loads(
        (CASES / "committee-decisions-register" / "meta.json").read_text(encoding="utf-8")
    )
    cases.append(
        live(
            "committee-decisions-register",
            "Реестр решений комитетов",
            "Офис / комитеты",
            c_meta["cutoff_date"],
            c_meta["assignment_counts"],
        )
    )
    b_meta = json.loads((CASES / "baf-project" / "meta.json").read_text(encoding="utf-8"))
    cases.append(
        live(
            "baf-project",
            "BAF project (ARID1A)",
            b_meta.get("organization", ""),
            b_meta["cutoff_date"],
            b_meta["assignment_counts"],
        )
    )
    for cid in (
        "komandirovki-K24-audit",
        "lab-sample-qc-release",
        "supply-contract-PS17-claims",
        "trip_audit",
    ):
        cases.append(stub(cid))

    # Friendlier stub titles
    titles = {
        "komandirovki-K24-audit": "Командировки K24 — аудит",
        "lab-sample-qc-release": "QC-релиз лабораторных проб",
        "supply-contract-PS17-claims": "Поставка PS17 — претензии",
        "trip_audit": "Аудит командировочных",
    }
    for c in cases:
        if c["id"] in titles:
            c["title"] = titles[c["id"]]

    return {
        "title": "Cowork cases demo",
        "description": "Интерактивные snapshot-кейсы Cowork для коллег. Без live-sync с Toolathlon.",
        "cases": cases,
    }


def patch_committee_demo_meta() -> None:
    path = CASES / "committee-decisions-register" / "demo_meta.json"
    meta = json.loads(path.read_text(encoding="utf-8"))
    meta["eval_mode"] = "harness"
    meta.setdefault("organization", "Офис / комитеты")
    for a in meta["assignments"]:
        a.setdefault("has_variants", False)
    write_json(path, meta)


def main() -> None:
    write_json(CONTENT / "catalog.json", build_catalog())

    for case_id in ("committee-decisions-register", "baf-project"):
        case_dir = CASES / case_id
        tree = build_tree(case_dir / "workspace")
        write_json(case_dir / "workspace_tree.json", tree)

    patch_committee_demo_meta()

    baf = CASES / "baf-project"
    write_json(baf / "demo_meta.json", build_baf_demo_meta(baf))
    write_json(baf / "derived" / "l2_preview.json", build_baf_l2_preview(baf))
    write_json(baf / "derived" / "file_previews.json", build_file_previews(baf))

    # Committee also gets empty previews map (md/png handled in app)
    write_json(
        CASES / "committee-decisions-register" / "derived" / "file_previews.json",
        {},
    )

    print("OK: catalog, trees, baf demo_meta, l2_preview, file_previews")


if __name__ == "__main__":
    main()
