import type { ActionRule, BuilderData, CharacterBuild, ExportKind, LibraryItem } from "../types";
import {
  archetypeAbility,
  archetypesForBuild,
  buildTitle,
  creationPathLabels,
  itemById,
  safeFileName,
} from "./build";

/* ------------------------------------------------------------------ *
 * Shared resolved-sheet model
 * ------------------------------------------------------------------ */

interface SheetStance {
  index: number;
  name: string;
  form?: LibraryItem;
  style?: LibraryItem;
  actions: ActionRule[];
}

interface ResolvedSheet {
  name: string;
  player: string;
  pathLabel: string;
  archetypes: Array<{ item: LibraryItem; ability: string }>;
  stances: SheetStance[];
  stat?: LibraryItem;
  skills: LibraryItem[];
  customSkill: string;
  notes: string;
}

function resolveSheet(data: BuilderData, build: CharacterBuild): ResolvedSheet {
  return {
    name: build.characterName.trim() || "Без имени",
    player: build.playerName.trim(),
    pathLabel: creationPathLabels[build.creationPath],
    archetypes: archetypesForBuild(data, build).map((item) => ({
      item,
      ability: archetypeAbility(item, build.creationPath),
    })),
    stances: build.stances.map((stance, index) => {
      const form = itemById(data, stance.formId);
      const style = itemById(data, stance.styleId);
      return {
        index: index + 1,
        name: stance.name,
        form,
        style,
        actions: [...(form?.rules.actions ?? []), ...(style?.rules.actions ?? [])],
      };
    }),
    stat: itemById(data, build.statId),
    skills: build.skillIds.map((id) => itemById(data, id)).filter(Boolean) as LibraryItem[],
    customSkill: build.customSkill.trim(),
    notes: build.notes.trim(),
  };
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function downloadText(fileName: string, text: string, type = "application/json") {
  // Без BOM: некоторые строгие JSON-парсеры отвергают файлы с ним.
  downloadBlob(new Blob([text], { type: `${type};charset=utf-8` }), fileName);
}

/* ------------------------------------------------------------------ *
 * 1. Character JSON (portable build)
 * ------------------------------------------------------------------ */

export function exportCharacterJson(data: BuilderData, build: CharacterBuild) {
  const sheet = resolveSheet(data, build);
  const payload = {
    type: "panic-at-the-dojo.character-build",
    schemaVersion: build.schemaVersion,
    exportedAt: new Date().toISOString(),
    build,
    resolved: {
      title: buildTitle(data, build),
      creationPath: sheet.pathLabel,
      archetypes: sheet.archetypes.map(({ item, ability }) => ({ ...item, currentAbility: ability })),
      stat: sheet.stat,
      skills: sheet.skills,
      customSkill: sheet.customSkill,
      stances: sheet.stances,
    },
  };
  downloadText(`${safeFileName(build.characterName)}.dojo-character.json`, JSON.stringify(payload, null, 2));
}

/* ------------------------------------------------------------------ *
 * 2. Printable HTML character sheet (great for the table / phone)
 * ------------------------------------------------------------------ */

const KIND_COLOR: Record<string, string> = {
  archetype: "#7b42b6",
  form: "#4169b2",
  style: "#c53d2f",
  stat: "#c9831f",
  skill: "#1f8a4c",
};

function esc(value: string | undefined): string {
  return (value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function actionsHtml(actions: ActionRule[]): string {
  if (actions.length === 0) return "";
  return `<ul class="actions">${actions
    .map(
      (a) =>
        `<li><span class="cost">${esc(a.cost)}</span><span class="aname">${esc(a.name)}</span><span class="aeff">${esc(
          a.effect,
        )}</span></li>`,
    )
    .join("")}</ul>`;
}

export function exportPrintableHtml(data: BuilderData, build: CharacterBuild) {
  const s = resolveSheet(data, build);
  const meta = [s.pathLabel, s.archetypes.map((a) => a.item.nameRu).join(" / "), s.stat?.nameRu]
    .filter(Boolean)
    .join(" · ");

  const abilityBlocks = s.archetypes
    .map(
      ({ item, ability }) =>
        `<div class="block arc"><h3>${esc(s.pathLabel)} · ${esc(item.nameRu)}</h3><p>${esc(
          ability || item.rules.ability || item.rules.summary,
        )}</p></div>`,
    )
    .join("");

  const stanceBlocks = s.stances
    .map((st) => {
      const form = st.form;
      const style = st.style;
      return `<details class="stance" open>
        <summary class="stanceHead"><span class="num">${st.index}</span><h3>${esc(st.name || "Стойка")}</h3><span class="foldHint"></span></summary>
        <div class="stanceBody">
        <div class="parts">
          <div class="part form"><span class="tag" style="background:${KIND_COLOR.form}">Форма</span>
            <strong>${esc(form?.nameRu ?? "—")}</strong>
            <em>${esc([form?.range && `дальность ${form.range}`, form?.actionDice].filter(Boolean).join(" · "))}</em>
            <p>${esc(form?.rules.summary ?? "")}</p>
          </div>
          <div class="part style"><span class="tag" style="background:${KIND_COLOR.style}">Стиль</span>
            <strong>${esc(style?.nameRu ?? "—")}</strong>
            <em>${esc([style?.range && `дальность ${style.range}`, style?.actionDice].filter(Boolean).join(" · "))}</em>
            <p>${esc(style?.rules.summary ?? "")}</p>
          </div>
        </div>
        ${actionsHtml(st.actions)}
        </div>
      </details>`;
    })
    .join("");

  const skillNames = [...s.skills.map((sk) => sk.nameRu), s.customSkill ? `${s.customSkill} (свой)` : ""].filter(Boolean);
  const skillsHtml = skillNames.map((n) => `<span class="pill">${esc(n)}</span>`).join("");

  const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(s.name)} — лист персонажа</title>
<style>
  :root{--ink:#1d2a2f;--muted:#5d6b72;--line:#d8e0e4;}
  *{box-sizing:border-box}
  body{margin:0;background:#eef1ef;color:var(--ink);font:15px/1.5 "Segoe UI",Inter,Arial,sans-serif}
  .sheet{max-width:820px;margin:24px auto;background:#fff;border:1px solid var(--line);border-radius:14px;overflow:hidden;box-shadow:0 18px 48px rgba(20,30,36,.12)}
  header{background:#16222a;color:#fff;padding:22px 26px;display:flex;align-items:center;gap:16px}
  .mark{width:54px;height:54px;border-radius:12px;background:#c53d2f;display:grid;place-items:center;font-size:30px;font-weight:800}
  header h1{margin:0;font-size:26px}
  header .meta{margin:4px 0 0;color:#aebcc3;font-size:14px}
  .body{padding:20px 26px}
  .block{border:1px solid var(--line);border-left:5px solid var(--muted);border-radius:10px;padding:12px 14px;margin:0 0 12px;background:#fbfcfc}
  .block.arc{border-left-color:${KIND_COLOR.archetype};background:#faf7ff}
  .block h3{margin:0 0 6px;font-size:15px}
  .block.arc h3{color:${KIND_COLOR.archetype}}
  .block p{margin:0;color:#33424a}
  h2.sec{font-size:13px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin:22px 0 10px;border-bottom:1px solid var(--line);padding-bottom:6px}
  .stance{border:1px solid var(--line);border-radius:12px;padding:14px;margin:0 0 12px}
  .stanceHead{display:flex;align-items:center;gap:10px;cursor:pointer;list-style:none}
  .stanceHead::-webkit-details-marker{display:none}
  .stanceHead::after{content:"▾";color:var(--muted);font-size:18px;transition:transform .15s}
  .stance:not([open]) .stanceHead::after{transform:rotate(-90deg)}
  .stanceHead .num{width:30px;height:30px;border-radius:8px;background:#16222a;color:#fff;display:grid;place-items:center;font-weight:800}
  .stanceHead h3{margin:0;font-size:18px}
  .foldHint{margin-left:auto;color:var(--muted);font-size:12px;font-weight:400}
  .foldHint::after{content:"свернуть"}.stance:not([open]) .foldHint::after{content:"развернуть"}
  .stanceBody{margin-top:10px}
  .stanceTools{display:flex;justify-content:flex-end;gap:7px;margin:-2px 0 10px}
  .stanceTools button{border:1px solid var(--line);border-radius:7px;background:#fff;color:var(--ink);padding:5px 9px;cursor:pointer}
  .stanceTools button:hover{background:#f4f7f7}
  .parts{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .part{border:1px solid var(--line);border-radius:10px;padding:10px}
  .part .tag{display:inline-block;color:#fff;font-size:11px;font-weight:800;text-transform:uppercase;border-radius:999px;padding:2px 9px}
  .part strong{display:block;margin:7px 0 2px;font-size:16px}
  .part em{color:var(--muted);font-style:normal;font-size:12px}
  .part p{margin:6px 0 0;color:#33424a;font-size:13px}
  ul.actions{list-style:none;margin:12px 0 0;padding:0;display:grid;gap:6px}
  ul.actions li{display:grid;grid-template-columns:auto 1fr;gap:4px 10px;border:1px solid #b9e0c6;background:#eef9f1;border-left:5px solid ${KIND_COLOR.skill};border-radius:8px;padding:7px 10px;font-size:13px}
  ul.actions .cost{grid-row:1/3;align-self:start;font-weight:800;color:${KIND_COLOR.skill};white-space:nowrap}
  ul.actions .aname{font-weight:800}
  ul.actions .aeff{color:#33424a}
  .pill{display:inline-block;background:#eaf6ee;border:1px solid #b9e0c6;color:#1f6e42;border-radius:999px;padding:5px 11px;margin:0 6px 6px 0;font-size:13px;font-weight:600}
  .stat p{margin:6px 0 0;color:#33424a}
  .notes{white-space:pre-wrap;color:#33424a}
  footer{padding:14px 26px;border-top:1px solid var(--line);color:var(--muted);font-size:12px;display:flex;justify-content:space-between}
  @media print{body{background:#fff}.sheet{box-shadow:none;border:none;margin:0;max-width:none}header{-webkit-print-color-adjust:exact;print-color-adjust:exact}.stanceTools,.foldHint,.stanceHead::after{display:none!important}details.stance:not([open])>.stanceBody{display:block!important}}
</style></head>
<body><div class="sheet">
  <header><div class="mark">道</div><div><h1>${esc(s.name)}</h1><div class="meta">${esc(meta)}${
    s.player ? ` · игрок: ${esc(s.player)}` : ""
  }</div></div></header>
  <div class="body">
    ${abilityBlocks || '<div class="block"><p>Архетип не выбран.</p></div>'}
    <h2 class="sec">Стойки</h2>
    <div class="stanceTools"><button type="button" onclick="document.querySelectorAll('details.stance').forEach(x=>x.open=true)">Развернуть все</button><button type="button" onclick="document.querySelectorAll('details.stance').forEach(x=>x.open=false)">Свернуть все</button></div>
    ${stanceBlocks}
    <h2 class="sec">Стать</h2>
    <div class="block stat" style="border-left-color:${KIND_COLOR.stat};background:#fdf7ec">
      <h3>${esc(s.stat?.nameRu ?? "Стать не выбрана")}</h3>
      <p>${esc(s.stat?.rules.ability || s.stat?.rules.summary || "")}</p>
    </div>
    <h2 class="sec">Навыки</h2>
    <div>${skillsHtml || '<span class="pill">навыки не выбраны</span>'}</div>
    ${s.notes ? `<h2 class="sec">Заметки</h2><div class="notes">${esc(s.notes)}</div>` : ""}
  </div>
  <footer><span>Паника в Додзе · цифровой компаньон</span><span>${esc(new Date().toLocaleDateString("ru-RU"))}</span></footer>
</div></body></html>`;

  downloadText(`${safeFileName(build.characterName)}.sheet.html`, html, "text/html");
}

/* ------------------------------------------------------------------ *
 * 3. TTS Saved Object (real cards where mapped, themed placeholders otherwise)
 *    Drop the .json into:
 *      Documents/My Games/Tabletop Simulator/Saves/Saved Objects/
 *    then spawn it from the in-game object menu.
 * ------------------------------------------------------------------ */

// Shared "Panic at the Dojo" card back, used as the face for elements that
// have no real card art mapped yet (keeps placeholders on-theme).
const FALLBACK_FACE =
  "https://steamusercontent-a.akamaihd.net/ugc/2205135519711693972/807BC3D938BC352D7C95FD988F39C3177E69AC5B/";

function makeGuidFactory() {
  const used = new Set<string>();
  return () => {
    let guid = "";
    do {
      guid = Math.floor(Math.random() * 0xffffff)
        .toString(16)
        .padStart(6, "0");
    } while (used.has(guid));
    used.add(guid);
    return guid;
  };
}

function elementDescription(item: LibraryItem, header?: string): string {
  const parts: string[] = [];
  if (header) parts.push(`[${header}]`);
  if (item.nameEn) parts.push(item.nameEn);
  const facts = [
    item.range ? `Дальность: ${item.range}` : "",
    item.actionDice ? `Кости: ${item.actionDice}` : "",
    item.family ? `Архетип: ${item.family}` : "",
  ].filter(Boolean);
  if (facts.length) parts.push(facts.join("  ·  "));
  if (item.rules.summary) parts.push(item.rules.summary);
  for (const a of item.rules.actions ?? []) parts.push(`▸ ${a.cost}: ${a.name}\n${a.effect}`);
  if (item.rules.ability && !item.rules.summary?.includes(item.rules.ability)) parts.push(item.rules.ability);
  const text = parts.join("\n\n");
  return text.length > 1400 ? `${text.slice(0, 1397)}…` : text;
}

interface CardSpec {
  nickname: string;
  description: string;
  faceUrl: string;
  backUrl: string;
  cardId: number;
  deckId: number;
  numWidth: number;
  numHeight: number;
}

function specForItem(item: LibraryItem, header: string | undefined, syntheticDeck: number): CardSpec {
  const tts = item.tts;
  if (tts?.faceUrl && tts.deckId != null) {
    return {
      nickname: item.nameRu,
      description: elementDescription(item, header),
      faceUrl: tts.faceUrl,
      backUrl: tts.backUrl ?? FALLBACK_FACE,
      cardId: tts.cardId ?? tts.deckId * 100,
      deckId: tts.deckId,
      numWidth: tts.numWidth ?? 1,
      numHeight: tts.numHeight ?? 1,
    };
  }
  return {
    nickname: item.nameRu,
    description: elementDescription(item, header),
    faceUrl: FALLBACK_FACE,
    backUrl: FALLBACK_FACE,
    cardId: syntheticDeck * 100,
    deckId: syntheticDeck,
    numWidth: 1,
    numHeight: 1,
  };
}

function ttsCard(spec: CardSpec, guid: string, posX: number, posZ: number) {
  return {
    GUID: guid,
    Name: "CardCustom",
    Transform: {
      posX,
      posY: 1.2,
      posZ,
      rotX: 0,
      rotY: 180,
      rotZ: 0,
      scaleX: 1.32,
      scaleY: 1,
      scaleZ: 1.32,
    },
    Nickname: spec.nickname,
    Description: spec.description,
    GMNotes: "",
    AltLookAngle: { x: 0, y: 0, z: 0 },
    ColorDiffuse: { r: 0.713, g: 0.713, b: 0.713 },
    LayoutGroupSortIndex: 0,
    Value: 0,
    Locked: false,
    Grid: true,
    Snap: true,
    IgnoreFoW: false,
    MeasureMovement: false,
    DragSelectable: true,
    Autoraise: true,
    Sticky: true,
    Tooltip: true,
    GridProjection: false,
    HideWhenFaceDown: true,
    Hands: true,
    CardID: spec.cardId,
    SidewaysCard: false,
    CustomDeck: {
      [String(spec.deckId)]: {
        FaceURL: spec.faceUrl,
        BackURL: spec.backUrl,
        NumWidth: spec.numWidth,
        NumHeight: spec.numHeight,
        BackIsHidden: true,
        UniqueBack: false,
        Type: 1,
      },
    },
    LuaScript: "",
    LuaScriptState: "",
    XmlUI: "",
  };
}

function sheetPlainText(s: ResolvedSheet): string {
  const lines: string[] = [];
  lines.push(`${s.name} — ${s.pathLabel}`);
  if (s.player) lines.push(`Игрок: ${s.player}`);
  lines.push("");
  for (const { item, ability } of s.archetypes) {
    lines.push(`АРХЕТИП: ${item.nameRu}`);
    if (ability) lines.push(ability);
    lines.push("");
  }
  s.stances.forEach((st) => {
    lines.push(`СТОЙКА ${st.index}: ${st.name}`);
    lines.push(`  Форма: ${st.form?.nameRu ?? "—"}`);
    lines.push(`  Стиль: ${st.style?.nameRu ?? "—"}`);
  });
  lines.push("");
  lines.push(`СТАТЬ: ${s.stat?.nameRu ?? "—"}`);
  const skills = [...s.skills.map((x) => x.nameRu), s.customSkill && `${s.customSkill} (свой)`].filter(Boolean);
  lines.push(`НАВЫКИ: ${skills.join(", ") || "—"}`);
  if (s.notes) {
    lines.push("");
    lines.push(`ЗАМЕТКИ: ${s.notes}`);
  }
  return lines.join("\n");
}

export function exportTtsObject(data: BuilderData, build: CharacterBuild) {
  const s = resolveSheet(data, build);
  const guid = makeGuidFactory();
  let syntheticDeck = 900;
  const nextDeck = () => syntheticDeck++;

  // Build the ordered list of element cards.
  const specs: CardSpec[] = [];
  s.archetypes.forEach(({ item }) => specs.push(specForItem(item, "Архетип", nextDeck())));
  if (s.stat) specs.push(specForItem(s.stat, "Стать", nextDeck()));
  s.stances.forEach((st) => {
    if (st.form) specs.push(specForItem(st.form, `Стойка ${st.index} · Форма`, nextDeck()));
    if (st.style) specs.push(specForItem(st.style, `Стойка ${st.index} · Стиль`, nextDeck()));
  });

  // A title/summary card so a single hover reveals the whole build.
  const skillList = [...s.skills.map((x) => x.nameRu), s.customSkill && `${s.customSkill} (свой)`]
    .filter(Boolean)
    .join(", ");
  const titleSpec: CardSpec = {
    nickname: `★ ${s.name}`,
    description: `${sheetPlainText(s)}\n\nНавыки: ${skillList || "—"}`,
    faceUrl: FALLBACK_FACE,
    backUrl: FALLBACK_FACE,
    cardId: nextDeck() * 100,
    deckId: syntheticDeck - 1,
    numWidth: 1,
    numHeight: 1,
  };

  const ordered = [titleSpec, ...specs];
  const perRow = 5;
  const stepX = 3.0;
  const stepZ = 4.3;
  const objectStates = ordered.map((spec, i) => {
    const row = Math.floor(i / perRow);
    const col = i % perRow;
    const posX = (col - (perRow - 1) / 2) * stepX;
    const posZ = -row * stepZ;
    return ttsCard(spec, guid(), posX, posZ);
  });

  const payload = {
    SaveName: `${s.name} — Паника в Додзе`,
    Date: new Date().toLocaleString("ru-RU"),
    VersionNumber: "",
    GameMode: "",
    GameType: "",
    GameComplexity: "",
    Tags: ["panic-at-the-dojo", "character"],
    Gravity: 0.5,
    PlayArea: 0.5,
    Table: "",
    Sky: "",
    Note: `Персонаж «${s.name}» (${s.pathLabel}). Сгенерировано билдером «Паника в Додзе».`,
    TabStates: {},
    LuaScript: "",
    LuaScriptState: "",
    XmlUI: "",
    ObjectStates: objectStates,
  };
  downloadText(`${safeFileName(build.characterName)}.SavedObject.json`, JSON.stringify(payload, null, 2));
}

/* ------------------------------------------------------------------ *
 * 4. Big PNG character sheet (dynamic height)
 * ------------------------------------------------------------------ */

export async function exportSheetPng(data: BuilderData, build: CharacterBuild) {
  const s = resolveSheet(data, build);
  const width = 1480;
  const maxHeight = 5200;
  const pad = 80;
  const contentWidth = width - pad * 2;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = maxHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.fillStyle = "#f6f7f4";
  ctx.fillRect(0, 0, width, maxHeight);

  // Header band
  ctx.fillStyle = "#16222a";
  ctx.fillRect(0, 0, width, 150);
  ctx.fillStyle = "#c53d2f";
  roundRect(ctx, pad, 38, 74, 74, 14);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.font = "800 44px Arial";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("道", pad + 16, 90);
  ctx.font = "800 46px Arial";
  ctx.fillText(s.name, pad + 100, 74);
  ctx.font = "600 24px Arial";
  ctx.fillStyle = "#aebcc3";
  const meta = [s.pathLabel, s.archetypes.map((a) => a.item.nameRu).join(" / "), s.stat?.nameRu]
    .filter(Boolean)
    .join("  ·  ");
  ctx.fillText(meta + (s.player ? `  ·  игрок: ${s.player}` : ""), pad + 100, 112);

  let y = 200;

  // Archetype ability blocks
  s.archetypes.forEach(({ item, ability }) => {
    const text = ability || item.rules.ability || item.rules.summary || "";
    const lines = wrapLines(ctx, text, contentWidth - 36, "400 25px Arial");
    const boxH = 60 + lines.length * 34;
    panel(ctx, pad, y, contentWidth, boxH, "#faf7ff", "#7b42b6");
    ctx.fillStyle = "#6d38a6";
    ctx.font = "800 27px Arial";
    ctx.fillText(`${s.pathLabel} · ${item.nameRu}`, pad + 24, y + 40);
    ctx.fillStyle = "#33424a";
    ctx.font = "400 25px Arial";
    lines.forEach((line, idx) => ctx.fillText(line, pad + 24, y + 78 + idx * 34));
    y += boxH + 18;
  });

  y += 6;
  ctx.fillStyle = "#5d6b72";
  ctx.font = "800 22px Arial";
  ctx.fillText("СТОЙКИ", pad, y);
  y += 22;

  // Stance cards
  s.stances.forEach((st) => {
    const formSummary = wrapLines(ctx, st.form?.rules.summary ?? "", contentWidth / 2 - 60, "400 22px Arial").slice(0, 3);
    const styleSummary = wrapLines(ctx, st.style?.rules.summary ?? "", contentWidth / 2 - 60, "400 22px Arial").slice(0, 3);
    // Все действия стойки: срез до 4 терял действия у стоек с 5+ (форма + стиль).
    const actionsBlocks = st.actions.map((a) => ({
      a,
      lines: wrapLines(ctx, a.effect, contentWidth - 230, "400 22px Arial").slice(0, 2),
    }));
    const headH = 60;
    const partsH = 112 + Math.max(formSummary.length, styleSummary.length) * 30;
    const actionsH = actionsBlocks.reduce((sum, b) => sum + 30 + b.lines.length * 28, 0);
    const boxH = headH + partsH + (actionsH ? actionsH + 14 : 0) + 24;

    panel(ctx, pad, y, contentWidth, boxH, "#ffffff", "#d8e0e4");
    ctx.fillStyle = "#16222a";
    roundRect(ctx, pad + 22, y + 20, 40, 40, 9);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = "800 24px Arial";
    ctx.fillText(String(st.index), pad + 35, y + 49);
    ctx.fillStyle = "#16222a";
    ctx.font = "800 30px Arial";
    ctx.fillText(st.name || "Стойка", pad + 78, y + 50);
    if (st.form?.actionDice) {
      ctx.textAlign = "right";
      ctx.font = "800 23px Arial";
      ctx.fillStyle = "#4169b2";
      ctx.fillText(`Кости: ${st.form.actionDice}`, pad + contentWidth - 24, y + 48);
      ctx.textAlign = "left";
    }

    const colY = y + headH + 6;
    const col2X = pad + contentWidth / 2 + 12;
    drawSlot(ctx, pad + 22, colY, "#4169b2", "ФОРМА", st.form?.nameRu ?? "—", formSummary);
    drawSlot(ctx, col2X, colY, "#c53d2f", "СТИЛЬ", st.style?.nameRu ?? "—", styleSummary);

    let ay = colY + partsH;
    actionsBlocks.forEach(({ a, lines }) => {
      ctx.fillStyle = "#1f8a4c";
      ctx.font = "800 22px Arial";
      ctx.fillText(`${a.cost}: ${a.name}`, pad + 26, ay + 6);
      ctx.fillStyle = "#33424a";
      ctx.font = "400 22px Arial";
      lines.forEach((line, idx) => ctx.fillText(line, pad + 26, ay + 34 + idx * 28));
      ay += 30 + lines.length * 28;
    });
    y += boxH + 16;
  });

  // Stat + skills row
  y += 6;
  ctx.fillStyle = "#5d6b72";
  ctx.font = "800 22px Arial";
  ctx.fillText("СТАТЬ И НАВЫКИ", pad, y);
  y += 22;
  const statText = s.stat?.rules.ability || s.stat?.rules.summary || "";
  const statLines = wrapLines(ctx, statText, contentWidth - 36, "400 24px Arial").slice(0, 6);
  const statH = 60 + statLines.length * 32;
  panel(ctx, pad, y, contentWidth, statH, "#fdf7ec", "#c9831f");
  ctx.fillStyle = "#a8660f";
  ctx.font = "800 27px Arial";
  ctx.fillText(s.stat?.nameRu ?? "Стать не выбрана", pad + 24, y + 40);
  ctx.fillStyle = "#33424a";
  ctx.font = "400 24px Arial";
  statLines.forEach((line, idx) => ctx.fillText(line, pad + 24, y + 76 + idx * 32));
  y += statH + 16;

  const skillNames = [...s.skills.map((x) => x.nameRu), s.customSkill ? `${s.customSkill} (свой)` : ""].filter(Boolean);
  y = drawPills(ctx, pad, y, contentWidth, skillNames.length ? skillNames : ["навыки не выбраны"]);
  y += 8;

  if (s.notes) {
    ctx.fillStyle = "#5d6b72";
    ctx.font = "800 22px Arial";
    ctx.fillText("ЗАМЕТКИ", pad, y);
    y += 14;
    const noteLines = wrapLines(ctx, s.notes, contentWidth, "400 23px Arial");
    ctx.fillStyle = "#33424a";
    ctx.font = "400 23px Arial";
    noteLines.forEach((line) => {
      y += 30;
      ctx.fillText(line, pad, y);
    });
    y += 10;
  }

  const finalHeight = Math.min(maxHeight, y + pad);

  // Crop to actual content height.
  const out = document.createElement("canvas");
  out.width = width;
  out.height = finalHeight;
  const octx = out.getContext("2d");
  if (!octx) return;
  octx.drawImage(canvas, 0, 0);

  await new Promise<void>((resolve) => {
    out.toBlob((blob) => {
      if (blob) downloadBlob(blob, `${safeFileName(build.characterName)}.sheet.png`);
      resolve();
    }, "image/png");
  });
}

/* ------------------------------------------------------------------ *
 * Dispatch
 * ------------------------------------------------------------------ */

export async function runExport(kind: ExportKind, data: BuilderData, build: CharacterBuild) {
  if (kind === "character-json") exportCharacterJson(data, build);
  if (kind === "print-html") exportPrintableHtml(data, build);
  if (kind === "tts-object") exportTtsObject(data, build);
  if (kind === "sheet-png") await exportSheetPng(data, build);
}

/* ------------------------------------------------------------------ *
 * Canvas helpers
 * ------------------------------------------------------------------ */

function panel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: string,
  accent: string,
) {
  ctx.fillStyle = fill;
  roundRect(ctx, x, y, w, h, 14);
  ctx.fill();
  ctx.strokeStyle = "#d8e0e4";
  ctx.lineWidth = 2;
  roundRect(ctx, x, y, w, h, 14);
  ctx.stroke();
  ctx.fillStyle = accent;
  roundRect(ctx, x, y, 6, h, 14);
  ctx.fill();
}

function drawSlot(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  label: string,
  value: string,
  summary: string[],
) {
  ctx.fillStyle = color;
  roundRect(ctx, x, y, 150, 30, 999);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.font = "800 16px Arial";
  ctx.fillText(label, x + 16, y + 21);
  ctx.fillStyle = "#16222a";
  ctx.font = "800 28px Arial";
  ctx.fillText(value, x, y + 64);
  ctx.fillStyle = "#33424a";
  ctx.font = "400 22px Arial";
  summary.forEach((line, idx) => ctx.fillText(line, x, y + 96 + idx * 30));
}

function drawPills(ctx: CanvasRenderingContext2D, x: number, y: number, maxWidth: number, names: string[]): number {
  ctx.font = "600 23px Arial";
  let cx = x;
  let cy = y + 30;
  const h = 40;
  names.forEach((name) => {
    const w = ctx.measureText(name).width + 36;
    if (cx + w > x + maxWidth) {
      cx = x;
      cy += h + 10;
    }
    ctx.fillStyle = "#eaf6ee";
    roundRect(ctx, cx, cy - 28, w, h, 999);
    ctx.fill();
    ctx.strokeStyle = "#b9e0c6";
    ctx.lineWidth = 1.5;
    roundRect(ctx, cx, cy - 28, w, h, 999);
    ctx.stroke();
    ctx.fillStyle = "#1f6e42";
    ctx.fillText(name, cx + 18, cy);
    cx += w + 10;
  });
  return cy + 18;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, font: string): string[] {
  ctx.font = font;
  const words = (text ?? "").split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}
