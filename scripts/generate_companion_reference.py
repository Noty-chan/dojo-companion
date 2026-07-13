from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

import docx


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "Паника в Додзе (перевод, редактируемый).docx"
SOURCE_JSON = ROOT / "data" / "companion_reference.source.json"
OUT = ROOT / "data" / "companion_reference.json"


def clean(text: str) -> str:
    return re.sub(r"\s+", " ", text.replace("\u00a0", " ")).strip()


def slug(value: str) -> str:
    value = value.lower().replace("ё", "е")
    value = re.sub(r"[^a-zа-я0-9]+", "-", value, flags=re.IGNORECASE)
    return value.strip("-") or "section"


def paragraphs() -> list[dict[str, Any]]:
    doc = docx.Document(SOURCE)
    result = []
    for index, paragraph in enumerate(doc.paragraphs):
        text = clean(paragraph.text)
        if not text:
            continue
        result.append(
            {
                "index": index,
                "style": paragraph.style.name if paragraph.style else "",
                "text": text,
            }
        )
    return result


def rows_between(paras: list[dict[str, Any]], start: int, end: int) -> list[dict[str, Any]]:
    return [row for row in paras if start <= row["index"] < end]


def find_heading(paras: list[dict[str, Any]], title: str, style: str = "Heading 2", after: int = -1) -> int:
    for row in paras:
        if row["index"] > after and row["style"] == style and row["text"] == title:
            return row["index"]
    raise ValueError(f"Heading not found: {style} {title!r} after {after}")


def heading_range(
    paras: list[dict[str, Any]],
    start_title: str,
    end_title: str,
    *,
    after: int = -1,
    style: str = "Heading 2",
) -> tuple[int, int]:
    start = find_heading(paras, start_title, style=style, after=after)
    end = find_heading(paras, end_title, style=style, after=start)
    return start, end


def generic_h3_section(
    paras: list[dict[str, Any]],
    start: int,
    end: int,
    section_id: str,
    title: str,
    category: str,
    summary: str,
    source: str,
    group_titles: dict[str, str] | None = None,
    skip_titles: set[str] | None = None,
    table: dict[str, Any] | None = None,
) -> dict[str, Any]:
    group_titles = group_titles or {}
    skip_titles = skip_titles or set()
    body: list[str] = []
    entries: list[dict[str, Any]] = []
    current: dict[str, Any] | None = None
    current_group = ""

    def flush() -> None:
        nonlocal current
        if current:
            entries.append(current)
            current = None

    for row in rows_between(paras, start, end):
        text = row["text"]
        style = row["style"]
        if row["index"] == start:
            continue
        if style == "Heading 3":
            flush()
            if text in group_titles:
                current_group = group_titles[text]
                body.append(text)
                continue
            if text in skip_titles:
                body.append(text)
                continue
            current = {
                "id": f"{section_id}-{slug(text)}",
                "title": text,
                "group": current_group,
                "body": [],
            }
            continue
        if style.startswith("Heading "):
            flush()
            continue
        if current:
            current["body"].append(text)
        else:
            body.append(text)
    flush()
    section = {
        "id": section_id,
        "title": title,
        "category": category,
        "summary": summary,
        "source": source,
        "body": body,
        "entries": entries,
    }
    if table:
        section["table"] = table
    return section


def super_moves(paras: list[dict[str, Any]], start: int, end: int) -> dict[str, Any]:
    rows = rows_between(paras, start, end)
    body: list[str] = []
    entries: list[dict[str, Any]] = []
    current_entry: dict[str, Any] | None = None
    current_move: dict[str, Any] | None = None

    def flush_move() -> None:
        nonlocal current_move
        if current_entry and current_move:
            current_entry.setdefault("moves", []).append(current_move)
            current_move = None

    def flush_entry() -> None:
        nonlocal current_entry
        flush_move()
        if current_entry:
            entries.append(current_entry)
            current_entry = None

    for row in rows:
        text = row["text"]
        style = row["style"]
        if row["index"] == start:
            continue
        if style == "Heading 3":
            flush_entry()
            current_entry = {
                "id": f"super-moves-{slug(text)}",
                "title": text,
                "body": [],
                "moves": [],
            }
            continue
        move_match = re.match(r"^(Альфа|Дельта):\s*(.+)$", text)
        if move_match and current_entry:
            flush_move()
            current_move = {
                "kind": move_match.group(1),
                "title": move_match.group(2),
                "effect": "",
                "notes": [],
            }
            continue
        if current_move:
            if not current_move["effect"]:
                current_move["effect"] = text
            else:
                current_move["notes"].append(text)
        elif current_entry:
            current_entry["body"].append(text)
        else:
            body.append(text)
    flush_entry()
    return {
        "id": "super-moves",
        "title": "Супер-приёмы героев",
        "category": "Супер-приёмы",
        "summary": "Общие правила Супер-приёмов и Альфа/Дельта для 13 героических архетипов.",
        "source": "DOCX: Глава 5, Супер-приёмы",
        "body": body,
        "entries": entries,
    }


def villain_archetypes(paras: list[dict[str, Any]], start: int, end: int) -> dict[str, Any]:
    rows = rows_between(paras, start, end)
    body: list[str] = []
    entries: list[dict[str, Any]] = []
    current_entry: dict[str, Any] | None = None
    current_move: dict[str, Any] | None = None

    def flush_move() -> None:
        nonlocal current_move
        if current_entry and current_move:
            current_entry.setdefault("moves", []).append(current_move)
            current_move = None

    def flush_entry() -> None:
        nonlocal current_entry
        flush_move()
        if current_entry:
            entries.append(current_entry)
            current_entry = None

    for row in rows:
        text = row["text"]
        style = row["style"]
        if row["index"] == start:
            continue
        if style == "Heading 2":
            flush_entry()
            current_entry = {
                "id": f"villain-{slug(text)}",
                "title": text,
                "body": [],
                "moves": [],
            }
            continue
        if style == "Heading 3":
            move_match = re.match(r"^(?:Супер-при[её]м:\s*)?(Альфа|Дельта)?\:?\s*(.+)$", text)
            title = move_match.group(2) if move_match else text
            kind = move_match.group(1) or "Супер"
            flush_move()
            current_move = {"kind": kind, "title": title, "effect": "", "notes": []}
            continue
        if current_move:
            if not current_move["effect"]:
                current_move["effect"] = text
            else:
                current_move["notes"].append(text)
        elif current_entry:
            # Флейвор-строка архетипа начинается с его названия и не является требованием к стойке —
            # помечаем _…_, чтобы читалка показала её курсивом (нарратив, а не механика).
            title = current_entry["title"]
            if text.startswith(title) and "должен иметь стойку" not in text and not text.startswith("●"):
                text = f"_{text}_"
            current_entry["body"].append(text)
        else:
            body.append(text)
    flush_entry()
    return {
        "id": "villain-archetypes",
        "title": "Архетипы злодеев",
        "category": "Враги",
        "summary": "Способности, требования к стилям и Супер-приёмы архетипов злодеев.",
        "source": "DOCX: Глава 8, Архетипы злодеев",
        "body": body,
        "entries": entries,
    }


def glossary(paras: list[dict[str, Any]], start: int, end: int) -> dict[str, Any]:
    # «Подробный глоссарий и указатель» в книге — это плоский список терминов
    # вида «Русский (English). Определение.» Читалка раньше его не показывала,
    # поэтому за столом не было ни глоссария, ни, например, описания брони.
    # Забираем два подраздела с чистыми определениями и отдаём как одну секцию
    # с layout=glossary (в UI — компактный словарь с поиском, а не «гармошки»).
    subsections = {
        "1. Базовые механические термины": "Базовые термины",
        "8. Дополнительные термины и необязательные правила": "Дополнительные правила",
    }
    term_re = re.compile(r"^(.+?)\s*\(([A-Za-z][^)]*)\)\.\s*(.+)$")
    entries: list[dict[str, Any]] = []
    current_group: str | None = None
    for row in rows_between(paras, start, end):
        text = row["text"]
        style = row["style"]
        if row["index"] == start:
            continue
        if style.startswith("Heading "):
            current_group = subsections.get(text)
            continue
        if current_group is None:
            continue
        match = term_re.match(text)
        if not match:
            continue
        ru = match.group(1).strip()
        en = match.group(2).strip()
        definition = match.group(3).strip()
        entries.append(
            {
                "id": f"glossary-{slug(en)}",
                "title": ru,
                "term": en,
                "group": current_group,
                "body": [definition],
            }
        )
    return {
        "id": "glossary",
        "title": "Термины и глоссарий",
        "category": "Справка",
        "summary": "Ключевые механические термины книги и необязательные правила: броня, щиты, жетоны, параметры боя и другие понятия.",
        "source": "DOCX: Подробный глоссарий и указатель",
        "layout": "glossary",
        "body": [],
        "entries": entries,
    }


def build() -> dict[str, Any]:
    paras = paragraphs()
    battle_parameters_start, battle_parameters_end = heading_range(paras, "Параметры боя", "Последний рывок")
    super_moves_start, super_moves_end = heading_range(paras, "Супер-приёмы", "Что такое навык?")
    stance_checks_start, stance_checks_end = heading_range(paras, "Проверки стойкой", "Состязания стойками")
    stance_contests_start, stance_contests_end = heading_range(paras, "Состязания стойками", "Цветовая маркировка")
    advancement_start, advancement_end = heading_range(paras, "Развитие", "Сборка врагов")
    enemy_advancement_start, enemy_advancement_end = heading_range(paras, "Рост врагов", "Воины")
    villain_start, villain_end = heading_range(paras, "Архетипы злодеев", "Памятка по созданию врагов", after=enemy_advancement_end)
    glossary_start, glossary_end = heading_range(
        paras, "Подробный глоссарий и указатель", "Памятка: базовые действия", style="Heading 1"
    )
    advancement_table = {
        "columns": ["Ур.", "XP", "Бонусная кость", "+HP", "Преимущество"],
        "rows": [
            ["1", "0", "-", "0", "Первые 3 стойки"],
            ["2", "5", "к4", "1", "Супер-приём"],
            ["3", "10", "к4", "2", "Новая стойка (4 всего)"],
            ["4", "15", "к6", "2", "Способность Химеры"],
            ["5", "20", "к6", "3", "Новая стойка (5 всего)"],
            ["6", "25", "к8", "4", "Второй Супер-приём"],
            ["7", "30", "к8", "5", "Новая стойка (6 всего)"],
            ["8", "35", "к10", "5", "Улучшить архетип"],
            ["9", "40", "к10", "6", "Новая стойка (7 всего)"],
            ["10", "50", "к12", "8", "Мастерство"],
        ],
    }
    enemy_table = {
        "columns": ["Ур.", "Кости босса", "Кость воина", "Преимущество"],
        "rows": [
            ["1", "к4", "-", "Боссы получают Супер-приём"],
            ["2", "к4 · к4", "к4", "Воины получают Супер-приём"],
            ["3", "к6 · к4", "к4", ""],
            ["4", "к6 · к6", "к6", "Дополнительный архетип"],
            ["5", "к8 · к6", "к6", "Боссы получают 4-ю стойку + Супер-приём"],
            ["6", "к8 · к8", "к8", "Статисты получают архетип"],
            ["7", "к10 · к8", "к8", ""],
            ["8", "к10 · к10", "к10", "Улучшить архетип"],
            ["9", "к12 · к10", "к10", ""],
            ["10", "к12 · к12", "к10", "Боссы получают 5-ю стойку + Супер-приём"],
        ],
    }
    sections = [
        super_moves(paras, super_moves_start, super_moves_end),
        generic_h3_section(
            paras,
            advancement_start,
            advancement_end,
            "advancement",
            "Развитие героев",
            "Развитие",
            "Уровни, XP, бонусная кость, +HP и новые возможности кампании.",
            "DOCX: Глава 7, Развитие",
            table=advancement_table,
        ),
        generic_h3_section(
            paras,
            enemy_advancement_start,
            enemy_advancement_end,
            "enemy-advancement",
            "Рост врагов",
            "Враги",
            "Как враги растут вместе с героями: статисты, воины, боссы, кости и Супер-приёмы.",
            "DOCX: Глава 8, Рост врагов",
            table=enemy_table,
        ),
        generic_h3_section(
            paras,
            battle_parameters_start,
            battle_parameters_end,
            "battle-parameters",
            "Параметры боя",
            "Бой",
            "Глобальные модификаторы боя: арена, перекос и условие победы.",
            "DOCX: Глава 2, Параметры боя",
            group_titles={
                "Параметры арены": "Арена",
                "Параметры перекоса": "Перекос",
                "Параметры победы": "Победа",
            },
        ),
        generic_h3_section(
            paras,
            stance_checks_start,
            stance_checks_end,
            "stance-checks",
            "Проверки стойкой",
            "Между боями",
            "Опасные проверки через стойку, бонусы навыков и последствия провала.",
            "DOCX: Глава 6, Проверки стойкой",
        ),
        generic_h3_section(
            paras,
            stance_contests_start,
            stance_contests_end,
            "stance-contests",
            "Состязания стойками",
            "Между боями",
            "Состязания, где несколько участников одновременно проходят проверку стойкой.",
            "DOCX: Глава 6, Состязания стойками",
        ),
        villain_archetypes(paras, villain_start, villain_end),
        glossary(paras, glossary_start, glossary_end),
    ]
    return {
        "schemaVersion": 1,
        "source": str(SOURCE.relative_to(ROOT)),
        "sections": sections,
    }


def main() -> int:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    if SOURCE.exists():
        payload = build()
        SOURCE_JSON.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    else:
        if not SOURCE_JSON.exists():
            raise FileNotFoundError(f"Нет ни {SOURCE.name}, ни публичного источника {SOURCE_JSON.name}")
        payload = json.loads(SOURCE_JSON.read_text(encoding="utf-8"))
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"wrote {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
