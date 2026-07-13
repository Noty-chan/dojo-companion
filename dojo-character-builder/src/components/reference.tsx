import { useState } from "react";
import { Search } from "lucide-react";
import type { BuilderData, LibraryItem, LibraryKind, ReferenceEntry, ReferenceSection } from "../types";
import { itemsByKind, kindLabels } from "../utils/build";
import { CollapsibleBlock, categoryOrder } from "./shared";

const quickTurnSteps = [
  { step: "1", title: "Выберите стойку" },
  { step: "2", title: "Бросьте кости" },
  { step: "3", title: "Тратьте пул" },
  { step: "4", title: "Сбросьте скорость" },
];

// Полный текст базовых действий из книги (глава 2). Раньше был укорочен и путал —
// приводим дословно, чтобы за столом не приходилось сверяться с книгой.
const basicActions = [
  { cost: "X", name: "Перемещение", effect: "Вы получаете X жетонов скорости." },
  {
    cost: "1+ / 3+ / 5+ / 7+ / 9+",
    name: "Атака",
    effect:
      "Выберите одного врага в пределах вашей дальности. Нанесите ему 1 урон. 3+: вместо этого нанесите 2 урона. 5+: вместо этого нанесите 3 урона и оттолкните цель на 1 клетку. 7+: вместо этого нанесите 4 урона и оттолкните цель ещё на 1 клетку. 9+: вместо этого нанесите 5 урона и оттолкните цель ещё на 1 клетку.",
  },
  { cost: "X", name: "Бросок", effect: "Выберите соседнего врага или союзника. Оттолкните его на расстояние до X клеток." },
  { cost: "X", name: "Захват", effect: "Выберите врага или союзника в пределах дальности. Подтяните его на расстояние до X клеток." },
  {
    cost: "1+ / 4+ / 8+",
    name: "Расчистить путь",
    effect:
      "Выберите препятствие в пределах дальности и уничтожьте его. 4+: также уничтожьте все препятствия в соседних с ним клетках. 8+: также уничтожьте все препятствия, соседние с этими препятствиями.",
  },
  { cost: "1+", name: "Вызов!", effect: "Бросьте вызов врагу в пределах дальности 1–4." },
  {
    cost: "2+ / 4+ / 7+",
    name: "Развей!",
    effect: "Уберите 1 жетон с кого-то в пределах дальности. 4+: уберите с него ещё 1 жетон. 7+: уберите с него ещё 1 жетон.",
  },
  { cost: "4+", name: "Все сюда!", effect: "Бросьте вызов любому числу врагов, которых видите." },
  {
    cost: "5+",
    name: "Выручить",
    effect:
      "Выберите союзника в пределах дальности, у которого 0 HP, либо союзника, которого нет на поле. Этот союзник лечится. Если его нет на поле, он возвращается в игру в любую пустую клетку по своему выбору.",
  },
];

const tokenReference = [
  { name: "Железо", effect: "При вражеском действии по вам: -1 урон и -1 перемещение за жетон." },
  { name: "Сила", effect: "При попадании: +1 урон или +1 толчок. Максимум 1 жетон за попадание." },
  { name: "Скорость", effect: "Тратьте на свободное перемещение; в конце своего хода вся скорость сбрасывается." },
  { name: "Горение", effect: "В конце хода получите урон по числу жетонов, затем сбросьте 1 жетон." },
  { name: "Вызов", effect: "Цель действий обязана включать того, кто бросил вызов. Можно держать только 1." },
  { name: "Слабость", effect: "Когда наносите урон, уменьшите его на 2, минимум до 0, затем сбросьте 1 жетон." },
];

function splitSentences(text: string | undefined) {
  return (text ?? "").replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s+/).filter(Boolean);
}

function trimText(text: string, limit = 120) {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > limit ? `${clean.slice(0, limit - 1).trim()}...` : clean;
}

export function statBonusText(stat: LibraryItem, limit = 120) {
  const sentences = splitSentences(stat.rules.ability || stat.rules.summary);
  const mechanical = sentences.find((sentence) => {
    const clean = sentence.trim();
    return (
      clean.startsWith("У вас") ||
      clean.startsWith("В начале") ||
      clean.startsWith("В конце") ||
      clean.startsWith("После") ||
      clean.startsWith("Когда") ||
      clean.startsWith("Вы можете") ||
      clean.startsWith("Дайте") ||
      clean.startsWith("Поместите") ||
      /\+\d|HP/.test(clean)
    );
  });
  return `Бонус: ${trimText(mechanical ?? sentences[sentences.length - 1] ?? stat.rules.summary, limit)}`;
}

export function QuickReferencePanel() {
  return (
    <section className="quickReferencePanel">
      <div className="quickReferenceHead">
        <div>
          <span>Быстрый доступ</span>
          <h2>Памятка за столом</h2>
        </div>
        <p>Короткие правила для хода, базовых действий, свободного перемещения и жетонов.</p>
      </div>

      <div className="turnStrip">
        {quickTurnSteps.map((item) => (
          <span key={item.step}>
            <strong>{item.step}</strong>
            {item.title}
          </span>
        ))}
      </div>

      <div className="quickReferenceGrid">
        <article className="basicActionsTable">
          <h3>Базовые действия</h3>
          <div>
            {basicActions.map((action) => (
              <span key={action.name}>
                <strong>{action.cost}</strong>
                <b>{action.name}</b>
                <em>{action.effect}</em>
              </span>
            ))}
          </div>
        </article>

        <article className="quickRulesStack">
          <section>
            <h3>Свободное перемещение</h3>
            <p><strong>Прямо:</strong> -1 скорость · <strong>диагональ:</strong> -2 скорости · <strong>в завалы:</strong> +1 скорость.</p>
            <p>Двигайтесь, пока есть скорость. В чужой ход свободное перемещение обычно возможно только в начале/конце хода врага или за пределами Арены.</p>
          </section>
          <section>
            <h3>Жетоны</h3>
            <div className="tokenReferenceList">
              {tokenReference.map((token) => (
                <span key={token.name}>
                  <strong>{token.name}</strong>
                  {token.effect}
                </span>
              ))}
            </div>
          </section>
        </article>
      </div>
    </section>
  );
}

export function ReferenceDashboard({
  data,
  activeSectionId,
  setActiveKind,
  setActiveReferenceSectionId,
}: {
  data: BuilderData;
  activeSectionId?: string;
  setActiveKind: (kind: LibraryKind) => void;
  setActiveReferenceSectionId: (id: string) => void;
}) {
  const cards = categoryOrder.map((kind) => ({
    kind,
    label: kindLabels[kind],
    count: itemsByKind(data, kind).length,
  }));
  const referenceSections = data.referenceSections ?? [];
  return (
    <section className="referenceDashboard">
      <div className="referenceHeader">
        <div>
          <h2>Справочник</h2>
          <p>{data.items.length} элементов · формы синхронизированы с патчем</p>
        </div>
      </div>
      <div className="referenceCards">
        {cards.map((card) => (
          <button key={card.kind} onClick={() => setActiveKind(card.kind)}>
            <strong>{card.count}</strong>
            <span>{card.label}</span>
          </button>
        ))}
      </div>
      <CollapsibleBlock className="referenceBlock" title="Разделы книги">
        <div className="referenceSectionButtons">
          {referenceSections.map((section) => (
            <button
              key={section.id}
              className={activeSectionId === section.id ? "active" : ""}
              onClick={() => setActiveReferenceSectionId(section.id)}
            >
              <strong>{section.title}</strong>
              <span>{section.entries.length} записей · {section.category}</span>
            </button>
          ))}
        </div>
      </CollapsibleBlock>
    </section>
  );
}

export function ReferenceReader({ section }: { section?: ReferenceSection }) {
  // Локальный поиск по записям раздела: раньше сюда прокидывался общий query из
  // библиотеки героев, и справочник фильтровался «невидимым» запросом без поля ввода.
  const [query, setQuery] = useState("");
  if (!section) {
    return (
      <CollapsibleBlock className="referenceReader" title="Справочник пуст">
        <p>Справочные разделы ещё не сгенерированы.</p>
      </CollapsibleBlock>
    );
  }
  const needle = query.trim().toLowerCase();
  const entries = needle
    ? section.entries.filter((entry) =>
        [entry.title, entry.group, entry.term, ...entry.body, ...(entry.moves ?? []).flatMap((move) => [move.kind, move.title, move.effect, ...(move.notes ?? [])])]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(needle)),
      )
    : section.entries;
  const isGlossary = section.layout === "glossary";
  return (
    <CollapsibleBlock className="referenceReader" title={section.title} meta={section.category}>
      <div className="referenceReaderHeader">
        <div>
          <span>{section.category}</span>
          <p>{section.summary}</p>
        </div>
        <small>{section.source}</small>
      </div>
      <div className="searchBox">
        <Search size={16} />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск по записям раздела" />
      </div>
      {section.body.length > 0 && (
        <div className="referenceBody">
          {section.body.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
        </div>
      )}
      {section.table && <ReferenceTableView section={section} />}
      {isGlossary ? (
        <GlossaryList entries={entries} />
      ) : (
        <div className="referenceEntries">
          {entries.map((entry) => <ReferenceEntryCard key={entry.id} entry={entry} />)}
          {entries.length === 0 && <p className="rulesEmpty">По этому запросу в разделе ничего не найдено.</p>}
        </div>
      )}
    </CollapsibleBlock>
  );
}

// Глоссарий — плоский список из десятков коротких терминов. «Гармошки» здесь
// только мешают: показываем компактный словарь (термин + перевод + определение),
// сгруппированный по подразделам книги. Поиск фильтрует записи выше по стеку.
function GlossaryList({ entries }: { entries: ReferenceEntry[] }) {
  if (entries.length === 0) {
    return <p className="rulesEmpty">По этому запросу в глоссарии ничего не найдено.</p>;
  }
  const groups: { group: string; items: ReferenceEntry[] }[] = [];
  for (const entry of entries) {
    const key = entry.group ?? "";
    const bucket = groups.find((item) => item.group === key);
    if (bucket) bucket.items.push(entry);
    else groups.push({ group: key, items: [entry] });
  }
  return (
    <div className="glossaryList">
      {groups.map((bucket) => (
        <section key={bucket.group || "_"} className="glossaryGroup">
          {bucket.group && <h4>{bucket.group}</h4>}
          <dl>
            {bucket.items.map((entry) => (
              <div key={entry.id} className="glossaryTerm">
                <dt>
                  <strong>{entry.title}</strong>
                  {entry.term && <span>{entry.term}</span>}
                </dt>
                <dd>{entry.body.join(" ")}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}

function ReferenceTableView({ section }: { section: ReferenceSection }) {
  if (!section.table) return null;
  return (
    <div className="referenceTableWrap">
      <table className="referenceTable">
        <thead>
          <tr>{section.table.columns.map((column) => <th key={column}>{column}</th>)}</tr>
        </thead>
        <tbody>
          {section.table.rows.map((row, index) => (
            <tr key={`${section.id}-${index}`}>
              {row.map((cell, cellIndex) => <td key={`${section.id}-${index}-${cellIndex}`}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Строки-флейвор помечены в данных как _…_ (нарратив, а не механика) → показываем курсивом.
function ReferenceBodyLine({ text }: { text: string }) {
  const flavor = /^_(.+)_$/s.exec(text.trim());
  if (flavor) return <p className="flavorLine"><em>{flavor[1]}</em></p>;
  return <p>{text}</p>;
}

function ReferenceEntryCard({ entry }: { entry: ReferenceEntry }) {
  return (
    <CollapsibleBlock className="referenceEntry" title={entry.title} meta={entry.group} defaultOpen={false}>
      {entry.body.map((paragraph, index) => <ReferenceBodyLine key={index} text={paragraph} />)}
      {entry.moves && entry.moves.length > 0 && (
        <div className="moveGrid">
          {entry.moves.map((move) => (
            <div key={`${move.kind}-${move.title}`} className="moveCard">
              <span>{move.kind}</span>
              <strong>{move.title}</strong>
              <p>{move.effect}</p>
              {move.notes?.map((note, index) => <small key={index}>{note}</small>)}
            </div>
          ))}
        </div>
      )}
    </CollapsibleBlock>
  );
}

export function ReferenceStats({ data }: { data: BuilderData; activeSection?: ReferenceSection }) {
  const forms = itemsByKind(data, "form");
  const purpleForms = forms.filter((item) => item.purpleDice);
  const statItems = itemsByKind(data, "stat");
  // Оставлены только полезные за столом справки: фиолетовые кости форм и бонусы статей.
  // Служебные блоки (счётчики данных, роли) убраны — они занимали место без пользы.
  return (
    <>
      <CollapsibleBlock className="referenceStatBox" title="Фиолетовые кости" defaultOpen>
        <div className="purpleList">
          {purpleForms.map((form) => (
            <span key={form.id}><strong>{form.nameRu.replace("Форма ", "")}</strong>{form.purpleDice}</span>
          ))}
        </div>
      </CollapsibleBlock>
      <CollapsibleBlock className="referenceStatBox" title="Стати" defaultOpen>
        <div className="statRows statSummaryRows">
          {statItems.map((stat) => (
            <span key={stat.id}><strong>{stat.nameRu.replace(" стать", "")}</strong>{statBonusText(stat, 96)}</span>
          ))}
        </div>
      </CollapsibleBlock>
    </>
  );
}
