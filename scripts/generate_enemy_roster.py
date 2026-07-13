"""Извлекает готовых («базовых») врагов из перевода в структурированный JSON.

Раздел книги «Вражеские силы» / «Уникальные враги» / «Боссы бэкеров» содержит
готовые блоки статистов, воинов и боссов. Текст правил берётся ДОСЛОВНО (в поле body),
парсится только структура: вид, стойка (форма+стиль), дальность, кости.

Выход: data/enemy_roster.json — читается generate_builder_data.py.
"""
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "_translation_full.txt"
OUT = ROOT / "data" / "enemy_roster.json"

START_MARKER = "Враги-Ангелы"
END_MARKER = "Бэкеры Kickstarter"

GROUP_RE = re.compile(r"^(Враги-.+|Уникальные враги|Боссы бэкеров)$")
STATIST_RE = re.compile(r"^(?P<name>.+?)\s*\((?P<count>\d+)\s+статист\w*\)\s*$")
UNIT_RE = re.compile(r"^(?P<name>.+?)\s*\((?P<kind>воин|босс)\)\s*$")
STANCE_RE = re.compile(r"^Стойка\s+(?P<stance>.+?)\s*\((?P<a>[^·)]+?)\s*·\s*(?P<b>[^·)]+?)\)\s*$")
DICE_RE = re.compile(r"^Дальность:\s*(?P<range>.+?)\s*·\s*Кости:\s*(?P<dice>.+)$")


def slug(value: str) -> str:
    value = value.lower().replace("ё", "е")
    value = re.sub(r"[^a-zа-я0-9]+", "-", value)
    return value.strip("-") or "enemy"


def split_stance(a: str, b: str) -> tuple[str, str]:
    """Возвращает (styleName, formName) независимо от порядка в скобках."""
    if "орм" in b.lower():
        return a.strip(), b.strip()
    return b.strip(), a.strip()


def build() -> list[dict[str, Any]]:
    lines = SOURCE.read_text(encoding="utf-8-sig").splitlines()
    try:
        # START/END встречаются и в оглавлении — берём вхождения по тексту раздела:
        # START — последнее (оглавление идёт раньше), END — первое ПОСЛЕ старта.
        start = max(i for i, ln in enumerate(lines) if ln.strip() == START_MARKER)
        end = next(i for i, ln in enumerate(lines) if i > start and ln.strip() == END_MARKER)
    except (StopIteration, ValueError) as exc:  # pragma: no cover
        raise SystemExit(f"Не найдены границы ростера ({START_MARKER}..{END_MARKER})") from exc

    region = [ln.strip() for ln in lines[start:end]]
    entries: list[dict[str, Any]] = []
    group = ""
    ids: set[str] = set()
    i = 0
    while i < len(region):
        line = region[i]
        if not line:
            i += 1
            continue
        gm = GROUP_RE.match(line)
        if gm:
            group = gm.group(1).replace("Враги-", "").strip()
            i += 1
            continue
        stat = STATIST_RE.match(line)
        unit = UNIT_RE.match(line) if not stat else None
        if stat or unit:
            name = (stat or unit).group("name").strip()
            if stat:
                kind, count = "stooge", int(stat.group("count"))
            else:
                kind = "warrior" if unit.group("kind") == "воин" else "boss"
                count = 1
            # тело — до следующего заголовка/группы
            body: list[str] = []
            j = i + 1
            while j < len(region):
                nxt = region[j]
                if nxt and (GROUP_RE.match(nxt) or STATIST_RE.match(nxt) or UNIT_RE.match(nxt)):
                    break
                if nxt:
                    body.append(nxt)
                j += 1

            stance_name = style_name = form_name = ""
            rng = dice = ""
            rest: list[str] = []
            for b in body:
                sm = STANCE_RE.match(b)
                dm = DICE_RE.match(b)
                if sm and not stance_name:
                    stance_name = sm.group("stance").strip()
                    style_name, form_name = split_stance(sm.group("a"), sm.group("b"))
                elif dm and not dice:
                    rng, dice = dm.group("range").strip(), dm.group("dice").strip()
                else:
                    rest.append(b)

            base_id = f"roster-{slug(name)}-{kind}"
            enemy_id = base_id
            n = 2
            while enemy_id in ids:
                enemy_id = f"{base_id}-{n}"
                n += 1
            ids.add(enemy_id)

            entries.append(
                {
                    "id": enemy_id,
                    "name": name,
                    "kind": kind,
                    "count": count,
                    "group": group,
                    "stanceName": stance_name,
                    "styleName": style_name,
                    "formName": form_name,
                    "range": rng,
                    "dice": dice,
                    "body": rest,
                    "flavor": rest[-1] if rest else "",
                }
            )
            i = j
            continue
        i += 1
    return entries


def main() -> int:
    entries = build()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"schemaVersion": 1, "enemies": entries}, ensure_ascii=False, indent=2), encoding="utf-8")
    kinds: dict[str, int] = {}
    for e in entries:
        kinds[e["kind"]] = kinds.get(e["kind"], 0) + 1
    print(f"wrote {OUT}: {len(entries)} enemies", kinds)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
