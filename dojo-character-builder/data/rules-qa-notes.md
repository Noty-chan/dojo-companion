# Rules QA Notes

## Checked 2026-06-30

- Patch 2024 `Battle Parameters` are translated in `../Паника в Додзе (перевод, редактируемый).docx`.
- `Параметры боя` are integrated into generated reference data, but the generator previously stopped at `Саботаж` and missed `Захватить Макгаффин` and `Турнирный бой`. The generator range now continues through the full section before `Последний рывок`.
- Enemy HP is not a boss/warrior/stooge property. It comes from the scene's cinematic weight.
- Current app scene scales follow Patch 2024 `Rules Updates -> Cinematic Weight`:
  - Минимальный: 10 HP, лечение 1, лимит щита 6
  - Легкий: 14 HP, лечение 2, лимит щита 9
  - Средний: 18 HP, лечение 2, лимит щита 12
  - Тяжелый: 22 HP, лечение 3, лимит щита 15
  - Мировой: 26 HP, лечение 4, лимит щита 18
- The workshop stores `scene.scaleId` and battle parameter selections. Enemy cards still carry `scaleId` so a standalone enemy export remains intelligible.
- The scene workspace now receives the generated `battle-parameters` section directly; visual QA confirmed 8 Arena, 8 Tilted, and 7 Victory parameters render and update the scene summary.
- The editable DOCX had three stale scale/glossary lines that still described old bonuses/penalties as part of cinematic weight. They now point to HP, Heal Value, Shield Cap, and Super Move access.
- A follow-up audit removed more stale Patch 2024 leftovers from the editable DOCX: old Edge/Krai obstacle wording, the old optional Heroic Power Up rule, the pre-patch enemy scale table, and old Hidden/Eye style glossary entries.
- `scripts/cheatsheet.py`, `scripts/cheatsheet_proof.py`, and `scripts/build_mvp_pdf_reportlab.py` were moved away from the old Bonuses/Penalties framing. The quick player sheet now points at Battle Parameters and patch scale values.
- `_ru_ch2.txt` is still a working extraction, not the canonical book, but its most dangerous stale mechanics were patched: scale HP, old Bonuses/Penalties block, Heroic Power Up, old Edge/Krai movement, and old rubble/speed notes.
- `../scripts/generate_companion_reference.py` no longer slices the DOCX by brittle hard-coded paragraph indexes. It now finds the relevant ranges by Heading 2 names, so future book edits are less likely to silently corrupt companion reference data.
- Visual QA on the generated MVP PDF checked the glossary/rules pages for `Параметры боя`, `Снаружи`, `Героический дух`, and the updated style glossary entries.
- Visual QA on the app checked `Мастерская -> Сцена` at desktop and mobile widths. The scene builder shows 8 arena parameters, 8 tilted parameters, and 7 victory parameters, including `Захватить Макгаффин` and `Турнирный бой`; mobile had no detected horizontal overflow in that view.
- Enemy advancement dice are currently a hand-authored table in `../scripts/generate_companion_reference.py`, not a parsed table from the PDF.
- A later tail audit fixed two stale glossary entries in the editable DOCX: `Осложнения` no longer mentions `повышенные ставки`, and `Состязания` no longer describes old skill contests.
- `_translation_full.txt`, `_translation_joined.txt`, and `_ch8_ru.txt` were regenerated from the current editable DOCX so raw searches no longer surface pre-patch scale, Edge/Krai, Heroic Power Up, or old shield wording from those files.
- `../scripts/generate_builder_data.py` now parses the current `Стать персонажа` section and includes the four Patch 2024 build options: `Массивная`, `Экспериментальная`, `Устрашающая`, and `Нестандартная`. The generated builder data now has 10 stats.
- `_ru_ch5.txt` no longer says Song + Thorns lets you keep multiple shields at once; it now points at stacking shields feeding `Симфония`.
- Tail polish fixed `Турнирный бой`: `половиной шкалы здоровья HP` became `половиной HP своей шкалы здоровья`.
- The book now uses `Снаружи` for the zone and lowercase `наружу` for movement direction, avoiding a false separate term.
- Companion reference dashboard now surfaces all 10 stat options, including the four Patch 2024 stats, so they are visible outside the hero builder; clicking a stat card opens that stat in the rules panel.
- Spacing polish normalized `Дальность · Кости` separators in stance headers and fixed one remaining `остаетесь` -> `остаётесь`.
- The GM Workshop now has a `Герои` tab: saved heroes appear as compact scene cards, imported character PNG/JSON files are saved into the hero card index, and the current hero can be saved from the Workshop.

## Needs Manual Review

- Do a deeper semantic Heroic Spirit pass only if the source changes again. The current direct audit found the VIP parameter text, Ten Thousand/Lucky die pass-through notes, and Teacher Delta wording present in the editable DOCX.
- Later GM tools should make health bars/turn count explicit for bosses, super stooges, and normal warriors instead of relying only on current HP.
