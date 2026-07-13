from __future__ import annotations

import argparse
import csv
import datetime as dt
import hashlib
import json
import re
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]

COLORS = {
    "archetype": "#7b42b6",
    "form": "#4169b2",
    "style": "#c53d2f",
    "stat": "#d68b12",
    "skill": "#c55a11",
}

FORM_SKILL_NAMES = (
    "Почти магия",
    "Профессионал",
    "Устрой шоу",
    "Несдвигаемый",
    "Соображай быстро",
    "Неудержимый",
    "Идеальный момент",
    "Теневой ходок",
    "Природная харизма",
    "Наблюдательный",
    "Бегущий по ветру",
    "Мирное сердце",
)
STAT_NAMES = (
    "Грациозная стать",
    "Бесшабашная стать",
    "Необъяснимая стать",
    "Подавляющая стать",
    "Коварная стать",
    "Нерушимая стать",
    "Массивная стать",
    "Экспериментальная стать",
    "Устрашающая стать",
    "Нестандартная стать",
)
ABILITY_CUES = (
    "В начале",
    "В конце",
    "После",
    "Когда",
    "Вы ",
    "У вас",
    "Стоимость",
    "До вашего",
    "В течение",
    "Первый раз",
    "Каждый раз",
    "Раз в",
    "Один раз",
)
ACTION_COST_RE = re.compile(
    r"^\s*(?:Бесплатно|X|\d+\+|\d+\s+(?=[^:]{0,70}?(?:жетон|HP|базов))[^:]{1,70})"
    r"(?:\s*(?:/|или|и)\s*(?:X|\d+\+|\d+\s+(?=[^:]{0,70}?(?:жетон|HP|базов))[^:]{1,70}))*\s*:",
    re.IGNORECASE,
)
LINE_RE = re.compile(r"^\[(\d+)\]\s*(.*)$")
STYLE_HEADING_RE = re.compile(
    r"^((?:.{2,60}?стиль)|(?:Стиль\s+[А-ЯЁа-яё]+(?:\s+[А-ЯЁа-яё]+){0,3}))"
    r"(?:\s+Дальность:\s*(.+))?$",
    re.IGNORECASE,
)
FORM_HEADING_RE = re.compile(r"^(Форма\s+[А-ЯЁ][А-Яа-яЁё -]{2,30})(?:\s+Альт\.:.*)?$")
ARCHETYPE_RE = re.compile(r"^Архетип:\s*(.+)$")
ABILITY_RE = re.compile(r"^(Адепт|Химера|Вихрь)\s+(.+?)\s+(.+)$")
FORM_META_RE = re.compile(r"Альт\.:\s*(.*?)\s+Кости действий:\s*(.+)$")
ACTION_BODY_CUES = (
    "Это действие",
    "Это жетонное действие",
    "Нанесите",
    "Выберите",
    "Поместите",
    "Телепортируйтесь",
    "Уберите",
    "Подтяните",
    "Оттолкните",
    "Положите",
    "Переместите",
    "Получите",
    "Вылечите",
    "Бросьте",
    "Ваше",
    "Ваши",
    "Вы ",
    "Все ",
    "Враг ",
    "Союзник ",
    "Уничтожьте",
)
EMBEDDED_STYLE_NOTE_RE = re.compile(
    r"(?<=\.)\s+((?:Стиль\s+[А-ЯЁ][А-Яа-яЁё0-9 «»\"'-]{2,48}?|"
    r"[А-ЯЁ][А-Яа-яЁё0-9 «»\"'-]{2,48}?\s+стиль)\s+—\s+)",
    re.IGNORECASE,
)


def clean_text(text: str) -> str:
    text = text.replace("\u00a0", " ").replace("–", "-")
    text = re.sub(r"\s+", " ", text).strip()
    return text


def clean_full_text(text: str) -> str:
    text = re.sub(r"===PAGE\s+\d+===", " ", text)
    return clean_text(text)


def read_numbered_lines(path: Path) -> list[dict[str, Any]]:
    lines = []
    for raw in path.read_text(encoding="utf-8-sig").splitlines():
        match = LINE_RE.match(raw.strip())
        if match:
            lines.append({"no": int(match.group(1)), "text": clean_text(match.group(2))})
    return lines


def slugify(value: str) -> str:
    value = clean_text(value).lower().replace("ё", "е")
    value = re.sub(r"[^a-zа-я0-9]+", "-", value, flags=re.IGNORECASE)
    return value.strip("-") or "item"


def source_key(kind: str, name: str) -> str:
    return f"{kind}-{slugify(name)}"


def first_sentence(text: str, limit: int = 220) -> str:
    text = clean_text(text)
    if not text:
        return ""
    parts = re.split(r"(?<=[.!?])\s+", text, maxsplit=1)
    sentence = parts[0]
    return sentence[:limit].rstrip() + ("..." if len(sentence) > limit else "")


def split_action(text: str) -> dict[str, str] | None:
    if not ACTION_COST_RE.match(text):
        return None
    prefix, rest = text.split(":", 1)
    rest = clean_text(rest)
    if not rest:
        return {"cost": clean_text(prefix), "name": "", "effect": ""}

    cue_positions: list[int] = []
    for cue in ACTION_BODY_CUES:
        match = re.search(rf"(?<![A-Za-zА-Яа-яЁё]){re.escape(cue)}", rest, re.IGNORECASE)
        if match and match.start() > 0:
            cue_positions.append(match.start())
    if cue_positions:
        start = min(cue_positions)
        name = clean_text(rest[:start])
        effect = clean_text(rest[start:])
        return {"cost": clean_text(prefix), "name": name, "effect": effect}

    words = rest.split()
    if not words:
        return {"cost": clean_text(prefix), "name": "", "effect": ""}
    if rest[0].islower():
        return {"cost": clean_text(prefix), "name": rest, "effect": "", "continuation": True}
    if len(words) <= 5 and (not re.search(r"[.!?]$", rest) or rest.endswith(("...", "?", "!"))):
        return {"cost": clean_text(prefix), "name": rest, "effect": ""}
    parts = rest.split(" ", 1)
    if len(parts) == 1:
        return {"cost": clean_text(prefix), "name": rest, "effect": ""}
    return {"cost": clean_text(prefix), "name": clean_text(parts[0]), "effect": clean_text(parts[1])}


def action_is_continuation(action: dict[str, str]) -> bool:
    name = action.get("name", "")
    return bool(action.get("continuation")) or bool(name and name[0].islower())


def append_action_text(action: dict[str, str], text: str) -> None:
    action["effect"] = clean_text(f"{action.get('effect', '')} {text}")


def split_embedded_style_note(text: str, style_name: str | None = None) -> tuple[str, str | None]:
    if style_name:
        variants = [style_name]
        if style_name.lower().startswith("стиль "):
            variants.append(style_name[6:])
        for variant in variants:
            if len(variant) < 4:
                continue
            match = re.search(rf"(?<=\.)\s+({re.escape(variant)}\b)", text, re.IGNORECASE)
            if match:
                return clean_text(text[: match.start()]), clean_text(text[match.start() :])
    match = EMBEDDED_STYLE_NOTE_RE.search(text)
    if not match:
        return text, None
    return clean_text(text[: match.start()]), clean_text(text[match.start() :])


def parse_form_skill(text: str) -> dict[str, str] | None:
    for skill_name in FORM_SKILL_NAMES:
        if text == skill_name:
            return {"name": skill_name, "summary": ""}
        if text.startswith(f"{skill_name} "):
            return {"name": skill_name, "summary": clean_text(text)}
    return None


def split_ability(text: str) -> tuple[str, str] | None:
    match = re.match(r"^(Адепт|Химера|Вихрь)\s+(.+)$", text)
    if not match:
        return None
    ability_kind = match.group(1).lower()
    rest = match.group(2)
    cue_positions = []
    for cue in ABILITY_CUES:
        cue_match = re.search(rf"(?<![A-Za-zА-Яа-яЁё]){re.escape(cue)}", rest)
        if cue_match and cue_match.start() > 0:
            cue_positions.append(cue_match.start())
    if not cue_positions:
        return None
    start = min(cue_positions)
    return ability_kind, clean_text(rest[start:])


def parse_form_heading(text: str) -> tuple[str, str | None, str | None] | None:
    if not text.startswith("Форма "):
        return None
    if "Альт.:" in text:
        name = clean_text(text.split("Альт.:", 1)[0])
        meta = FORM_META_RE.search(text)
        alts = clean_text(meta.group(1)) if meta else None
        dice = clean_text(meta.group(2)) if meta else None
        return name, alts, dice
    if "." in text or " — " in text:
        return None
    if len(text) <= 34:
        return text, None, None
    return None


def parse_forms(lines: list[dict[str, Any]]) -> list[dict[str, Any]]:
    starts: list[tuple[int, str, str | None, str | None]] = []
    for i, line in enumerate(lines):
        parsed = parse_form_heading(line["text"])
        if parsed:
            starts.append((i, *parsed))

    items = []
    for pos, (start, name, inline_alts, inline_dice) in enumerate(starts):
        end = starts[pos + 1][0] if pos + 1 < len(starts) else len(lines)
        section = [row["text"] for row in lines[start + 1 : end]]
        alts = inline_alts
        dice = inline_dice
        if section and section[0].startswith("Альт.:"):
            meta = FORM_META_RE.search(section[0])
            if meta:
                alts = clean_text(meta.group(1))
                dice = clean_text(meta.group(2))
            section = section[1:]

        actions = []
        ability_parts = []
        notes = []
        current_action: dict[str, str] | None = None
        after_actions = False
        skill = None
        for text in section:
            action = split_action(text)
            if action:
                if current_action and action_is_continuation(action):
                    append_action_text(current_action, text)
                    continue
                if not current_action and actions and action_is_continuation(action):
                    append_action_text(actions[-1], text)
                    continue
                if current_action:
                    actions.append(current_action)
                current_action = action
                after_actions = True
                continue
            if current_action:
                if text.startswith("●") or current_action["effect"].endswith(":"):
                    append_action_text(current_action, text)
                    continue
                actions.append(current_action)
                current_action = None
            parsed_skill = parse_form_skill(text)
            if after_actions and parsed_skill and not skill:
                skill = parsed_skill
                continue
            if after_actions:
                notes.append(text)
            else:
                ability_parts.append(text)
        if current_action:
            actions.append(current_action)

        item = {
            "sourceKey": source_key("form", name),
            "id": source_key("form", name),
            "kind": "form",
            "nameRu": name,
            "color": COLORS["form"],
            "rules": {
                "summary": first_sentence(" ".join(ability_parts)),
                "ability": clean_text(" ".join(ability_parts)),
                "actions": actions,
                "notes": notes[:8],
                "tags": infer_tags(" ".join([name, *ability_parts, *notes])),
            },
            "source": {"file": "_ru_ch4.txt", "line": lines[start]["no"]},
        }
        if alts:
            item["aliases"] = [clean_text(part) for part in alts.split("/") if clean_text(part)]
        if dice:
            item["actionDice"] = dice
        if skill:
            item["skill"] = skill
        items.append(item)
    return items


def load_patched_forms(path: Path | None) -> list[dict[str, Any]]:
    if not path or not path.exists():
        return []
    payload = json.loads(path.read_text(encoding="utf-8-sig"))
    forms = []
    for form in payload.get("forms", []):
        name = clean_text(form["name"])
        passive_parts = [clean_text(part) for part in form.get("passive", []) if clean_text(part)]
        actions = [
            {
                "cost": clean_text(action.get("cost", "")),
                "name": clean_text(action.get("name", "")),
                "effect": clean_text(action.get("text", "")),
            }
            for action in form.get("actions", [])
        ]
        skill = form.get("skill") or {}
        notes = [clean_text(form.get("changeNote", ""))]
        notes = [note for note in notes if note]
        tags_source = " ".join([name, form.get("en", ""), *form.get("roles", []), *passive_parts, *notes])
        item = {
            "sourceKey": source_key("form", name),
            "id": source_key("form", name),
            "kind": "form",
            "nameRu": name,
            "nameEn": clean_text(form.get("en", "")),
            "color": COLORS["form"],
            "aliases": [clean_text(part) for part in form.get("alt", []) if clean_text(part)],
            "roles": [clean_text(role) for role in form.get("roles", []) if clean_text(role)],
            "actionDice": clean_text(form.get("dice", "")),
            "purpleDice": clean_text(form.get("purpleDice", "")),
            "rules": {
                "summary": clean_text(" ".join(passive_parts)),
                "ability": clean_text(" ".join(passive_parts)),
                "actions": actions,
                "notes": notes[:8],
                "tags": infer_tags(tags_source),
            },
            "source": {"file": str(path.relative_to(ROOT)) if path.is_relative_to(ROOT) else path.name},
        }
        if skill:
            item["skill"] = {
                "name": clean_text(skill.get("name", "")),
                "summary": clean_text(skill.get("text", "")),
            }
        forms.append(item)
    return forms


def make_skill_items(forms: list[dict[str, Any]]) -> list[dict[str, Any]]:
    skills = []
    for form in forms:
        skill = form.get("skill")
        if not skill:
            continue
        summary = skill.get("summary") or skill["name"]
        skill_item = {
            "sourceKey": source_key("skill", skill["name"]),
            "id": source_key("skill", skill["name"]),
            "kind": "skill",
            "nameRu": skill["name"],
            "family": form["nameRu"],
            "formId": form["id"],
            "color": COLORS["skill"],
            "rules": {
                "summary": first_sentence(summary),
                "ability": clean_text(summary),
                "actions": [],
                "notes": [],
                "tags": infer_tags(" ".join([skill["name"], summary, form["nameRu"], "навык"])),
            },
            "source": form.get("source", {}),
        }
        skills.append(skill_item)
    return skills


def parse_stats(path: Path | None) -> list[dict[str, Any]]:
    if not path or not path.exists():
        return []
    text = clean_full_text(path.read_text(encoding="utf-8-sig"))
    start_markers = (
        "Стать персонажа Каждый герой выбирает себе стать",
        "Стати Каждый герой выбирает себе стать",
    )
    start = next((pos for marker in start_markers if (pos := text.find(marker)) >= 0), -1)
    end_markers = ("Справочный список архетипов", "Адепты Первый шаг")
    end = next((pos for marker in end_markers if start >= 0 and (pos := text.find(marker, start)) >= 0), -1)
    if start < 0 or end < 0:
        return []
    section = text[start:end]
    positions: list[tuple[int, str]] = []
    for name in STAT_NAMES:
        pos = section.find(name)
        if pos >= 0:
            positions.append((pos, name))
    positions.sort()
    items = []
    for index, (pos, name) in enumerate(positions):
        body_start = pos + len(name)
        body_end = positions[index + 1][0] if index + 1 < len(positions) else len(section)
        body = clean_text(section[body_start:body_end])
        item = {
            "sourceKey": source_key("stat", name),
            "id": source_key("stat", name),
            "kind": "stat",
            "nameRu": name,
            "color": COLORS["stat"],
            "rules": {
                "summary": first_sentence(body),
                "ability": body,
                "actions": [],
                "notes": [],
                "tags": infer_tags(" ".join([name, body])),
            },
            "source": {"file": path.name},
        }
        items.append(item)
    return items


def is_style_heading(text: str) -> tuple[str, str | None] | None:
    match = STYLE_HEADING_RE.match(text)
    if not match:
        return None
    name = clean_text(match.group(1))
    if len(name) > 54 or name.startswith("Если ") or name.startswith("Когда "):
        return None
    return name, clean_text(match.group(2)) if match.group(2) else None


def parse_archetypes_and_styles(lines: list[dict[str, Any]]) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    current_archetype: dict[str, Any] | None = None
    current_style: dict[str, Any] | None = None

    def flush_style():
        nonlocal current_style
        if not current_style:
            return
        body = current_style.pop("_body")
        actions = []
        ability_parts = []
        notes = []
        current_action = None
        after_actions = False
        for text in body:
            if text.startswith("Дальность:"):
                current_style["range"] = clean_text(text.split(":", 1)[1])
                continue
            action = split_action(text)
            if action:
                if current_action and action_is_continuation(action):
                    append_action_text(current_action, text)
                    continue
                if not current_action and actions and action_is_continuation(action):
                    append_action_text(actions[-1], text)
                    continue
                if current_action:
                    actions.append(current_action)
                current_action = action
                after_actions = True
                continue
            if current_action:
                combined = clean_text(f"{current_action['effect']} {text}")
                clean_effect, embedded_note = split_embedded_style_note(combined, current_style["nameRu"])
                current_action["effect"] = clean_effect
                actions.append(current_action)
                current_action = None
                if embedded_note:
                    notes.append(embedded_note)
                    after_actions = True
                    continue
                continue
            if after_actions:
                notes.append(text)
            else:
                ability_parts.append(text)
        if current_action:
            actions.append(current_action)

        text_for_tags = " ".join([current_style["nameRu"], *ability_parts, *notes])
        summary_source = " ".join(ability_parts)
        if not summary_source and actions:
            summary_source = actions[0].get("effect", "")
        current_style["rules"] = {
            "summary": first_sentence(summary_source),
            "ability": clean_text(" ".join(ability_parts)),
            "actions": actions,
            "notes": notes[:8],
            "tags": infer_tags(text_for_tags),
        }
        items.append(current_style)
        current_style = None

    def flush_archetype():
        nonlocal current_archetype
        flush_style()
        if current_archetype:
            current_archetype["rules"]["summary"] = first_sentence(current_archetype["rules"]["ability"])
            current_archetype["rules"]["tags"] = infer_tags(current_archetype["rules"]["ability"])
            items.append(current_archetype)
            current_archetype = None

    for line in lines:
        text = line["text"]
        arch_match = ARCHETYPE_RE.match(text)
        if arch_match:
            flush_archetype()
            name = clean_text(arch_match.group(1))
            current_archetype = {
                "sourceKey": source_key("archetype", name),
                "id": source_key("archetype", name),
                "kind": "archetype",
                "nameRu": name,
                "color": COLORS["archetype"],
                "rules": {"summary": "", "ability": "", "actions": [], "notes": [], "tags": []},
                "abilities": {},
                "source": {"file": "_ru_ch5.txt", "line": line["no"]},
            }
            continue

        style_heading = is_style_heading(text)
        if style_heading and current_archetype:
            flush_style()
            name, range_value = style_heading
            current_style = {
                "sourceKey": source_key("style", name),
                "id": source_key("style", name),
                "kind": "style",
                "nameRu": name,
                "family": current_archetype["nameRu"],
                "color": COLORS["style"],
                "_body": [],
                "source": {"file": "_ru_ch5.txt", "line": line["no"]},
            }
            if range_value:
                current_style["range"] = range_value
            continue

        if current_style:
            current_style["_body"].append(text)
            continue

        if current_archetype:
            ability_match = split_ability(text)
            if ability_match:
                current_archetype["abilities"][ability_match[0]] = ability_match[1]
            else:
                current_archetype["rules"]["ability"] = clean_text(
                    f"{current_archetype['rules']['ability']} {text}"
                )

    flush_archetype()
    return items


def infer_tags(text: str) -> list[str]:
    needles = [
        ("урон", ("урон", "попад", "нанесите")),
        ("лечение", ("леч", "вылеч")),
        ("контроль", ("контрол", "отмен", "перенаправ")),
        ("дальность", ("дальност",)),
        ("мобильность", ("телепорт", "перемест", "сдвин", "скорост")),
        ("защита", ("брон", "щит", "желез")),
        ("поддержка", ("союзник", "команд", "поддерж")),
        ("жетоны", ("жетон",)),
        ("препятствия", ("стен", "ловуш", "туман", "копи")),
        ("слабость", ("слабост",)),
    ]
    lower = text.lower()
    tags = [tag for tag, variants in needles if any(variant in lower for variant in variants)]
    return tags[:5]


def load_tts_manifest(path: Path | None) -> dict[str, dict[str, Any]]:
    if not path or not path.exists():
        return {}
    by_name: dict[str, dict[str, Any]] = {}
    with path.open("r", encoding="utf-8-sig", newline="") as fh:
        reader = csv.DictReader(fh, delimiter="\t")
        for row in reader:
            nickname = clean_text(row.get("nickname", ""))
            if not nickname:
                continue
            by_name[nickname.lower()] = {
                "sourceSave": "TS_AutoSave_3.json",
                "guid": row.get("guid") or None,
                "cardId": int(row["card_id"]) if (row.get("card_id") or "").isdigit() else None,
                "faceUrl": row.get("face_url") or None,
                "backUrl": row.get("back_url") or None,
            }
    return by_name


def load_overrides(path: Path | None) -> dict[str, Any]:
    if not path or not path.exists():
        return {"items": {}, "notes": []}
    return json.loads(path.read_text(encoding="utf-8-sig"))


def load_reference_sections(path: Path | None) -> list[dict[str, Any]]:
    if not path or not path.exists():
        return []
    payload = json.loads(path.read_text(encoding="utf-8-sig"))
    return payload.get("sections", [])


ENEMY_KIND_LABELS = {"stooge": "статисты", "warrior": "воин", "boss": "босс"}


def load_enemy_roster(path: Path | None) -> list[dict[str, Any]]:
    if not path or not path.exists():
        return []
    return json.loads(path.read_text(encoding="utf-8-sig")).get("enemies", [])


def roster_reference_section(enemies: list[dict[str, Any]]) -> dict[str, Any]:
    """Готовые враги из книги как читаемый раздел справочника (текст — дословно)."""
    entries = []
    for e in enemies:
        body: list[str] = []
        if e.get("stanceName"):
            body.append(f"Стойка {e['stanceName']} ({e['styleName']} · {e['formName']})")
        if e.get("dice"):
            body.append(f"Дальность: {e.get('range', '?')} · Кости: {e['dice']}")
        flavor = e.get("flavor", "")
        for line in e.get("body", []):
            # Последняя строка блока — нарративный флейвор; помечаем _…_ для курсива в читалке.
            body.append(f"_{line}_" if line and line == flavor else line)
        entries.append(
            {
                "id": e["id"],
                "title": f"{e['name']} ({ENEMY_KIND_LABELS.get(e['kind'], e['kind'])})",
                "group": e.get("group", ""),
                "body": body,
            }
        )
    return {
        "id": "enemy-roster",
        "title": "Готовые враги",
        "category": "Враги",
        "summary": "Готовые статисты, воины и боссы из книги: по темам архетипов, уникальные враги и боссы-бэкеры. Можно загрузить в мастерскую.",
        "source": "DOCX: Глава 9, Вражеские силы",
        "body": [
            "Готовые враги собраны на основе стоек и архетипов злодеев. Их можно читать здесь и загружать в Мастерскую одним нажатием.",
        ],
        "entries": entries,
    }


def apply_overrides(items: list[dict[str, Any]], overrides: dict[str, Any], tts_manifest: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    item_overrides = overrides.get("items", {})
    result = []
    for item in items:
        override = item_overrides.get(item["sourceKey"], {})
        merged = {**item, **{k: v for k, v in override.items() if k not in {"tags", "tts"}}}
        if override.get("tags"):
            merged["rules"]["tags"] = override["tags"]
        if override.get("tts"):
            merged["tts"] = {k: v for k, v in override["tts"].items() if v not in (None, "")}
        elif merged.get("nameEn"):
            tts = tts_manifest.get(str(merged["nameEn"]).lower())
            if tts:
                merged["tts"] = {k: v for k, v in tts.items() if v not in (None, "")}
        result.append(merged)
    return result


def source_hash(paths: list[Path]) -> str:
    digest = hashlib.sha256()
    for path in paths:
        if path and path.exists():
            digest.update(path.name.encode("utf-8"))
            digest.update(path.read_bytes())
    return digest.hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate data for the Russian Panic at the Dojo character builder.")
    parser.add_argument("--ch4", type=Path, default=ROOT / "_ru_ch4.txt")
    parser.add_argument("--ch5", type=Path, default=ROOT / "_ru_ch5.txt")
    parser.add_argument("--full", type=Path, default=ROOT / "_translation_full.txt")
    parser.add_argument("--forms-patched", type=Path, default=ROOT / "data" / "forms_patched.json")
    parser.add_argument("--reference", type=Path, default=ROOT / "data" / "companion_reference.json")
    parser.add_argument("--enemy-roster", type=Path, default=ROOT / "data" / "enemy_roster.json")
    parser.add_argument("--tts-manifest", type=Path, default=ROOT / "tmp" / "tts_dojo_builder_assets" / "dojo_builder_card_manifest.tsv")
    parser.add_argument("--overrides", type=Path, default=ROOT / "dojo-character-builder" / "data" / "builder-overrides.json")
    parser.add_argument("--out", type=Path, default=ROOT / "dojo-character-builder" / "public" / "data" / "builder-data.json")
    parser.add_argument("--report", type=Path, default=ROOT / "dojo-character-builder" / "data" / "builder-data-report.json")
    args = parser.parse_args()

    ch5_lines = read_numbered_lines(args.ch5)
    forms = load_patched_forms(args.forms_patched)
    if not forms:
        ch4_lines = read_numbered_lines(args.ch4)
        forms = parse_forms(ch4_lines)
    items = forms + parse_archetypes_and_styles(ch5_lines) + parse_stats(args.full)
    reference_sections = load_reference_sections(args.reference)
    enemy_roster = load_enemy_roster(args.enemy_roster)
    if enemy_roster:
        reference_sections = reference_sections + [roster_reference_section(enemy_roster)]
    overrides = load_overrides(args.overrides)
    tts_manifest = load_tts_manifest(args.tts_manifest)
    items = apply_overrides(items, overrides, tts_manifest)
    items = items + apply_overrides(
        make_skill_items([item for item in items if item["kind"] == "form"]),
        overrides,
        tts_manifest,
    )
    items.sort(key=lambda item: (["archetype", "form", "style", "stat", "skill"].index(item["kind"]) if item["kind"] in ["archetype", "form", "style", "stat", "skill"] else 99, item.get("family", ""), item["nameRu"]))

    # Lucky Style and Ten Thousand Style each add a к4 to your Action Dice (a die icon in the
    # original layout that came through as a "[добрать из вёрстки]" placeholder in the source).
    for item in items:
        for field in ("summary", "ability"):
            value = item["rules"].get(field)
            if value and "костям действий" in value:
                item["rules"][field] = re.sub(
                    r"(костям действий:\s*)\[добрать из вёрстки\]", r"\1к4", value
                )

    # Forms, styles and stats: the short summary often truncates the passive to its first sentence.
    # Surface the full passive text (ability) so the builder's compact views don't lose rules.
    for item in items:
        if item["kind"] in ("form", "style", "stat"):
            ability = (item["rules"].get("ability") or "").strip()
            summary = (item["rules"].get("summary") or "").strip()
            if len(ability) > len(summary):
                item["rules"]["summary"] = ability

    payload = {
        "schemaVersion": 1,
        "generatedAt": dt.datetime.now(dt.timezone.utc).isoformat(),
        "sourceHash": source_hash([args.forms_patched, args.reference, args.ch4, args.ch5, args.full, args.overrides, args.tts_manifest]),
        "sourceNotes": [
            "Generated from data/forms_patched.json, data/companion_reference.json, _ru_ch5.txt, and _translation_full.txt.",
            "Manual stable ids, English names, and TTS metadata are applied from dojo-character-builder/data/builder-overrides.json.",
        ],
        "items": items,
        "referenceSections": reference_sections,
        "enemyRoster": enemy_roster,
    }
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    counts: dict[str, int] = {}
    for item in items:
        counts[item["kind"]] = counts.get(item["kind"], 0) + 1
    report = {
        "output": str(args.out),
        "counts": counts,
        "total": len(items),
        "withTts": sum(1 for item in items if item.get("tts")),
        "referenceSections": len(reference_sections),
        "missingSummary": [item["nameRu"] for item in items if not item.get("rules", {}).get("summary")],
    }
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
