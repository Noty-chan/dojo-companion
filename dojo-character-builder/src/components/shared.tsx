import React, { useEffect, useState } from "react";
import { FileJson, ImageDown, Layers3, PackageOpen } from "lucide-react";
import type { CreationPath, ExportKind, LibraryItem, LibraryKind } from "../types";
import { archetypeAbility, creationPathLabels, kindShortLabels } from "../utils/build";

export const categoryOrder: LibraryKind[] = ["archetype", "form", "style", "stat", "skill"];

export function SectionSwitch<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ id: T; label: string; meta?: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="sectionSwitch" aria-label={label}>
      <span>{label}</span>
      <div>
        {options.map((option) => (
          <button key={option.id} className={value === option.id ? "active" : ""} onClick={() => onChange(option.id)}>
            <strong>{option.label}</strong>
            {option.meta && <small>{option.meta}</small>}
          </button>
        ))}
      </div>
    </div>
  );
}

export function StepHeader({ number, title, detail, action }: { number: string; title: string; detail: string; action?: React.ReactNode }) {
  return (
    <div className="stepHeader">
      <span>{number}</span>
      <div>
        <h2>{title}</h2>
        <p>{detail}</p>
      </div>
      {action}
    </div>
  );
}

export function AbilityBlock({ item, path }: { item: LibraryItem; path: CreationPath }) {
  const ability = archetypeAbility(item, path);
  return (
    <article className="abilityBlock">
      <strong>{creationPathLabels[path]} {item.nameRu}</strong>
      <p>{ability || "Способность не найдена в данных."}</p>
    </article>
  );
}

export function ActionPreview({ form, style }: { form?: LibraryItem; style?: LibraryItem }) {
  // Показываем все действия формы и стиля: срез терял действия у стоек, где их >4
  // (напр. Форма Танца + Иллюзорный стиль = 5 действий).
  const actions = [...(form?.rules.actions ?? []), ...(style?.rules.actions ?? [])];
  return (
    <div className="actionPreview">
      {actions.map((action) => (
        <div key={`${action.cost}-${action.name}`} className="miniAction">
          <strong>{action.cost}: {action.name}</strong>
          <span>{action.effect}</span>
        </div>
      ))}
      {actions.length === 0 && <p>{[form?.rules.summary, style?.rules.summary].filter(Boolean).join(" ") || "Выберите форму и стиль."}</p>}
    </div>
  );
}

export function libraryMeta(item: LibraryItem) {
  return [
    item.nameEn,
    item.family ?? kindShortLabels[item.kind],
    item.range ? `дальность ${item.range}` : "",
    item.actionDice ? `кости ${item.actionDice}` : "",
  ].filter(Boolean).join(" · ");
}

export function ItemBadges({ item, compact }: { item: LibraryItem; compact?: boolean }) {
  return (
    <div className={`itemBadges ${compact ? "compact" : ""}`}>
      {item.roles?.map((role) => <span key={role} className="roleBadge">{role}</span>)}
      {item.purpleDice && <span className="purpleDiceBadge">фиолетовые: {item.purpleDice}</span>}
    </div>
  );
}

export function BuildSlot({ label, item, empty, onClick }: { label: string; item?: LibraryItem; empty: string; onClick?: () => void }) {
  return (
    <button type="button" className="buildSlot" style={{ borderColor: item?.color ?? "#d7e0e4" }} onClick={onClick}>
      <span>{label}</span>
      <strong>{item?.nameRu ?? empty}</strong>
      <small>{item ? libraryMeta(item) || item.rules.summary : ""}</small>
      {item && (item.roles?.length || item.purpleDice) ? <ItemBadges item={item} compact /> : null}
    </button>
  );
}

export function EmptyHint({ text }: { text: string }) {
  return <div className="emptyHint">{text}</div>;
}

// Числовое поле с локальным черновиком: поле можно очистить и редактировать, не
// прыгая в 1 на каждый штрих; значение зажимается и коммитится на blur/Enter.
export function NumberField({
  value,
  min,
  max,
  onCommit,
  className,
  "aria-label": ariaLabel,
}: {
  value: number;
  min?: number;
  max?: number;
  onCommit: (value: number) => void;
  className?: string;
  "aria-label"?: string;
}) {
  const [draft, setDraft] = useState(String(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setDraft(String(value));
  }, [value, focused]);
  const commit = () => {
    const parsed = Number(draft);
    const clamped = Number.isFinite(parsed) && draft.trim() !== ""
      ? Math.min(max ?? Number.POSITIVE_INFINITY, Math.max(min ?? Number.NEGATIVE_INFINITY, parsed))
      : value;
    onCommit(clamped);
    setDraft(String(clamped));
  };
  return (
    <input
      type="number"
      min={min}
      max={max}
      className={className}
      value={draft}
      aria-label={ariaLabel}
      onFocus={() => setFocused(true)}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        setFocused(false);
        commit();
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
      }}
    />
  );
}

export function CollapsibleBlock({
  title,
  meta,
  className,
  defaultOpen = true,
  children,
}: {
  title: React.ReactNode;
  meta?: React.ReactNode;
  className?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const stateLabel = isOpen ? "Свернуть" : "Развернуть";
  return (
    <section className={`${className ?? "collapsibleBlock"} ${isOpen ? "open" : "collapsed"}`}>
      <button className="collapsibleHeading" onClick={() => setIsOpen((current) => !current)} aria-expanded={isOpen}>
        <span>{title}</span>
        <em>{meta ? <>{meta} · {stateLabel}</> : stateLabel}</em>
      </button>
      {isOpen && <div className="collapsibleContent">{children}</div>}
    </section>
  );
}

export function SkillPill({ item, muted }: { item?: LibraryItem; muted?: boolean }) {
  if (!item) return null;
  return <strong className={`skillPill ${muted ? "muted" : ""}`}>{item.nameRu}</strong>;
}

export function pathKeyRu(path: CreationPath) {
  if (path === "adept") return "адепт";
  if (path === "chimera") return "химера";
  return "вихрь";
}

export function capitalizeRu(value: string) {
  return value ? value[0].toUpperCase() + value.slice(1) : value;
}

export function RulesPanel({ item, currentPath }: { item?: LibraryItem; currentPath: CreationPath }) {
  if (!item) {
    return (
      <div className="rulesPanel">
        <h2>Справка</h2>
        <p className="rulesEmpty">Выберите элемент библиотеки, чтобы увидеть полный текст правил.</p>
      </div>
    );
  }

  const archetypeEntries = item.abilities ? Object.entries(item.abilities) : [];
  return (
    <div className="rulesPanel">
      <div className="rulesPanelHeader">
        <span style={{ background: item.color }} />
        <div>
          <h2>{item.nameRu}</h2>
          <p>
            {libraryMeta(item) || kindShortLabels[item.kind]}
          </p>
        </div>
      </div>

      {(item.roles?.length || item.purpleDice || item.actionDice) && (
        <section className="rulesSection formMetaSection">
          <h3>Параметры</h3>
          {item.roles?.length ? <ItemBadges item={item} /> : null}
          {item.actionDice && (
            <div className="diceStrip">
              <span>Кости действий</span>
              <strong>{item.actionDice}</strong>
            </div>
          )}
          {item.purpleDice && (
            <div className="diceStrip purple">
              <span>Фиолетовые кости</span>
              <strong>{item.purpleDice}</strong>
            </div>
          )}
        </section>
      )}

      {item.rules.ability && (
        <section className="rulesSection">
          <h3>{item.kind === "skill" ? "Навык" : "Способность"}</h3>
          <p>{item.rules.ability}</p>
        </section>
      )}

      {archetypeEntries.length > 0 && (
        <section className="rulesSection">
          <h3>Архетипные способности</h3>
          {archetypeEntries.map(([key, value]) => (
            <p key={key} className={key === currentPath || key === pathKeyRu(currentPath) ? "currentAbility" : ""}>
              <strong>{capitalizeRu(key)}:</strong> {value}
            </p>
          ))}
        </section>
      )}

      {item.skill && (
        <section className="rulesSection skillRule">
          <h3>Навык формы</h3>
          <p><strong>{item.skill.name}:</strong> {item.skill.summary.replace(`${item.skill.name} `, "")}</p>
        </section>
      )}

      {item.rules.actions && item.rules.actions.length > 0 && (
        <section className="rulesSection">
          <h3>Действия</h3>
          {item.rules.actions.map((action) => (
            <div className="rulesAction" key={`${action.cost}-${action.name}`}>
              <strong>{action.cost}: {action.name}</strong>
              <p>{action.effect}</p>
            </div>
          ))}
        </section>
      )}

      {item.rules.notes && item.rules.notes.length > 0 && (
        <section className="rulesSection">
          <h3>Пояснения</h3>
          {item.rules.notes.map((note, index) => <p key={index}>{note}</p>)}
        </section>
      )}

      {item.rules.tags && item.rules.tags.length > 0 && (
        <div className="tagRow">
          {item.rules.tags.map((tag) => <span key={tag}>{tag}</span>)}
        </div>
      )}
    </div>
  );
}

export function ExportPanel({ onExport }: { onExport: (kind: ExportKind) => void }) {
  const buttons: Array<{ kind: ExportKind; label: string; detail: string; icon: React.ReactNode }> = [
    { kind: "tts-object", label: "TTS-объект для стола", detail: "Saved Object с реальными картами, где есть", icon: <Layers3 size={18} /> },
    { kind: "print-html", label: "Лист для печати (HTML)", detail: "открыть на телефоне или распечатать к столу", icon: <PackageOpen size={18} /> },
    { kind: "sheet-png", label: "Большая PNG-картинка", detail: "лист персонажа для чата или печати", icon: <ImageDown size={18} /> },
    { kind: "character-json", label: "JSON персонажа", detail: "повторное открытие и обмен билдом", icon: <FileJson size={18} /> },
  ];
  return (
    <div className="exportPanel">
      <h2>Экспорт</h2>
      {buttons.map((button) => (
        <button key={button.kind} data-testid={`export-${button.kind}`} onClick={() => onExport(button.kind)}>
          {button.icon}
          <span>
            <strong>{button.label}</strong>
            <small>{button.detail}</small>
          </span>
        </button>
      ))}
    </div>
  );
}
