import { useEffect, useRef, useState } from "react";
import type { Drawing, TableState, TableToken } from "../types";
import { counterTypes, isMarkerType, markerMeta } from "../types";
import { CELL, boardSize, cellCenter, cellDistance, hexPolygonPoints, pointToCell, speedCost, type Point } from "../utils/grid";
import { cellsInRange, crossesWall, type RangeSpec } from "../utils/range";
import type { Tool } from "../main";

export interface ActivePing {
  id: string;
  x: number;
  y: number;
  color: string;
}

// Линейка — ломаная: правый клик во время протяжки добавляет узел.
export interface RulerFx {
  points: Point[];
  cells: number;
  cost: number;
  color: string;
}

interface RulerDraft {
  cells: { x: number; y: number }[]; // старт + зафиксированные узлы
  hover: { x: number; y: number };
}

// SVG-поле: фон → клетки (квадраты или гексы) → рисунки → террейн → фишки → линейки → пинги.
export function Board({
  table,
  selectedId,
  activeTurnId,
  tool,
  isGM,
  showOverlays,
  rangeByToken,
  ignoreWallsByToken,
  drawColor,
  drawGlow,
  remoteRulers,
  pings,
  zoom,
  onZoomDelta,
  onSelect,
  onMove,
  onCellAction,
  onDrawCommit,
  onPing,
  onRuler,
}: {
  table: TableState;
  selectedId?: string;
  activeTurnId?: string;
  tool: Tool;
  isGM: boolean;
  showOverlays: boolean;
  rangeByToken: Record<string, RangeSpec | undefined>;
  ignoreWallsByToken: Record<string, boolean>;
  drawColor: string;
  drawGlow?: boolean;
  remoteRulers: Record<string, RulerFx>;
  pings: ActivePing[];
  zoom: number;
  onZoomDelta: (factor: number) => void;
  onSelect: (id?: string) => void;
  onMove: (id: string, x: number, y: number) => void;
  onCellAction: (x: number, y: number) => void;
  onDrawCommit: (points: number[]) => void;
  onPing: (x: number, y: number) => void;
  onRuler: (fx?: RulerFx) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragId, setDragId] = useState<string | undefined>();
  const [hoveredId, setHoveredId] = useState<string | undefined>();
  const [rulerDraft, setRulerDraft] = useState<RulerDraft | undefined>();
  const [localRuler, setLocalRuler] = useState<RulerFx | undefined>();
  const [draft, setDraft] = useState<number[] | undefined>();
  // Мультитач: карта активных указателей для пинч-зума и пан жестом по пустому месту.
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchDistRef = useRef<number | undefined>(undefined);
  const panRef = useRef<{ x: number; y: number; left: number; top: number } | undefined>(undefined);

  const size = boardSize(table.gridType, table.gridW, table.gridH);

  function scrollContainer(): HTMLElement | null {
    return svgRef.current?.closest(".boardViewport") ?? null;
  }

  function pinchDistance(): number | undefined {
    const points = [...pointersRef.current.values()];
    if (points.length < 2) return undefined;
    return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
  }

  function boardPoint(event: React.PointerEvent): { x: number; y: number } | undefined {
    const svg = svgRef.current;
    if (!svg) return undefined;
    const ctm = svg.getScreenCTM();
    if (!ctm) return undefined;
    const local = new DOMPoint(event.clientX, event.clientY).matrixTransform(ctm.inverse());
    return { x: local.x, y: local.y };
  }

  function cellFromEvent(event: React.PointerEvent) {
    const point = boardPoint(event);
    return point ? pointToCell(table.gridType, table.gridW, table.gridH, point) : undefined;
  }

  // Линейка: суммируем дистанцию и стоимость по всем сегментам ломаной.
  function rulerFx(draftState: RulerDraft): RulerFx {
    const cells = [...draftState.cells, draftState.hover];
    let total = 0;
    let cost = 0;
    for (let i = 0; i + 1 < cells.length; i += 1) {
      total += cellDistance(table.gridType, cells[i], cells[i + 1]);
      cost += speedCost(table.gridType, cells[i], cells[i + 1]);
    }
    return {
      points: cells.map((cell) => cellCenter(table.gridType, cell.x, cell.y)),
      cells: total,
      cost,
      color: drawColor,
    };
  }

  function updateRuler(draftState: RulerDraft) {
    setRulerDraft(draftState);
    const fx = rulerFx(draftState);
    setLocalRuler(fx);
    onRuler(fx);
  }

  function endRuler() {
    if (!rulerDraft) return;
    setRulerDraft(undefined);
    setLocalRuler(undefined);
    onRuler(undefined);
  }

  // Shift во время протяжки — тоже залом (правый клик работает не везде, например на тачпадах).
  useEffect(() => {
    if (!rulerDraft) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Shift" || event.repeat) return;
      const last = rulerDraft.cells[rulerDraft.cells.length - 1];
      const { hover } = rulerDraft;
      if (last.x !== hover.x || last.y !== hover.y) {
        updateRuler({ cells: [...rulerDraft.cells, hover], hover });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // updateRuler стабилен по смыслу: пересоздаётся вместе с rulerDraft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rulerDraft]);

  function handlePointerDown(event: React.PointerEvent, token?: TableToken) {
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    // Два пальца = пинч-зум: отменяем начатые жесты и не задеваем поле.
    if (pointersRef.current.size >= 2) {
      pinchDistRef.current = pinchDistance();
      setDragId(undefined);
      setDraft(undefined);
      panRef.current = undefined;
      return;
    }
    const point = boardPoint(event);
    const cell = cellFromEvent(event);
    if (!point) return;
    if (tool === "select") {
      if (token) {
        onSelect(token.id);
        setDragId(token.id);
        try {
          (event.currentTarget as Element).setPointerCapture?.(event.pointerId);
        } catch {
          // Захват указателя не критичен.
        }
      } else {
        onSelect(undefined);
        // Пустое место — пан: тянем поле (актуально при зуме и на тач-экранах).
        const container = scrollContainer();
        if (container) {
          panRef.current = { x: event.clientX, y: event.clientY, left: container.scrollLeft, top: container.scrollTop };
        }
      }
      return;
    }
    if (tool === "ping") {
      onPing(point.x, point.y);
      return;
    }
    if (tool === "ruler") {
      if (!cell) return;
      updateRuler({ cells: [cell], hover: cell });
      return;
    }
    if (tool === "draw") {
      setDraft([point.x, point.y]);
      return;
    }
    // террейн / ластик
    if (cell) onCellAction(cell.x, cell.y);
  }

  function handlePointerMove(event: React.PointerEvent) {
    if (pointersRef.current.has(event.pointerId)) {
      pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }
    // Пинч-зум: два активных указателя.
    if (pointersRef.current.size >= 2) {
      const dist = pinchDistance();
      if (dist && pinchDistRef.current && Math.abs(dist - pinchDistRef.current) > 2) {
        onZoomDelta(dist / pinchDistRef.current);
        pinchDistRef.current = dist;
      }
      return;
    }
    if (tool === "select") {
      if (dragId) {
        const cell = cellFromEvent(event);
        if (!cell) return;
        const token = table.tokens.find((record) => record.id === dragId);
        if (token && (token.x !== cell.x || token.y !== cell.y)) onMove(dragId, cell.x, cell.y);
        return;
      }
      // Пан по пустому месту.
      if (panRef.current && event.buttons === 1) {
        const container = scrollContainer();
        if (container) {
          container.scrollLeft = panRef.current.left - (event.clientX - panRef.current.x);
          container.scrollTop = panRef.current.top - (event.clientY - panRef.current.y);
        }
      }
      return;
    }
    if (tool === "ruler" && rulerDraft) {
      const cell = cellFromEvent(event);
      if (!cell) return;
      // Нажатие правой кнопки во время протяжки приходит как pointermove с button=2
      // (chorded buttons): фиксируем узел — линейка становится ломаной.
      if (event.button === 2 && (event.buttons & 2) !== 0) {
        const last = rulerDraft.cells[rulerDraft.cells.length - 1];
        if (last.x !== cell.x || last.y !== cell.y) {
          updateRuler({ cells: [...rulerDraft.cells, cell], hover: cell });
        }
        return;
      }
      updateRuler({ ...rulerDraft, hover: cell });
      return;
    }
    if (tool === "draw" && draft && event.buttons === 1) {
      const point = boardPoint(event);
      if (!point) return;
      const lastX = draft[draft.length - 2];
      const lastY = draft[draft.length - 1];
      if ((point.x - lastX) ** 2 + (point.y - lastY) ** 2 > 36) {
        setDraft((current) => (current ? [...current, point.x, point.y] : current));
      }
      return;
    }
    if ((tool === "erase" || isTerrainTool(tool)) && event.buttons === 1) {
      const cell = cellFromEvent(event);
      if (cell) onCellAction(cell.x, cell.y);
    }
  }

  function handlePointerUp(event?: React.PointerEvent) {
    if (event) pointersRef.current.delete(event.pointerId);
    else pointersRef.current.clear();
    if (pointersRef.current.size < 2) pinchDistRef.current = undefined;
    panRef.current = undefined;
    setDragId(undefined);
    endRuler();
    if (draft) {
      if (draft.length >= 6) onDrawCommit(draft);
      setDraft(undefined);
    }
  }

  const terrain = table.tokens.filter((token) => token.kind === "terrain");
  // Стены для затемнения дальности: клетки со стеной блокируют линию действия.
  const wallCells = new Set(terrain.filter((token) => token.terrainType === "wall").map((token) => `${token.x}:${token.y}`));
  const units = table.tokens.filter((token) => token.kind !== "terrain" && (isGM || !token.hidden));
  const hasBg = Boolean(table.background);
  const rulers = [...Object.values(remoteRulers), ...(localRuler ? [localRuler] : [])];

  // Подсветка дальности активной стойки: у выбранной фишки — ярко, у наведённой — слегка.
  const rangeLayers = units
    .filter((token) => token.id === selectedId || token.id === hoveredId)
    .map((token) => ({ token, spec: rangeByToken[token.id], strong: token.id === selectedId }))
    .filter((layer): layer is { token: TableToken; spec: RangeSpec; strong: boolean } => Boolean(layer.spec));

  return (
    <svg
      ref={svgRef}
      className={`boardSvg tool-${isTerrainTool(tool) ? "terrain" : tool} ${Math.abs(zoom - 1) > 0.001 ? "zoomed" : ""}`}
      style={Math.abs(zoom - 1) > 0.001 ? { width: `${zoom * 100}%`, height: "auto" } : undefined}
      viewBox={`0 0 ${size.x} ${size.y}`}
      onPointerDown={(event) => handlePointerDown(event)}
      onPointerMove={handlePointerMove}
      onPointerUp={(event) => handlePointerUp(event)}
      onPointerLeave={(event) => handlePointerUp(event)}
      onContextMenu={(event) => {
        // Правый клик занят узлами линейки; браузерное меню на поле не нужно.
        if (tool === "ruler") event.preventDefault();
      }}
    >
      {table.background && (
        <image
          href={table.background.url}
          x={table.background.x}
          y={table.background.y}
          width={table.background.natW * table.background.scale}
          height={table.background.natH * table.background.scale}
          opacity={table.background.opacity}
          preserveAspectRatio="none"
          pointerEvents="none"
        />
      )}

      {/* клетки */}
      {Array.from({ length: table.gridW * table.gridH }, (_, index) => {
        const col = index % table.gridW;
        const row = Math.floor(index / table.gridW);
        if (table.gridType === "hex") {
          const center = cellCenter("hex", col, row);
          return <polygon key={index} points={hexPolygonPoints(center)} className={`boardCell ${hasBg ? "withBg" : (col + row) % 2 === 0 ? "even" : "odd"}`} />;
        }
        return (
          <rect
            key={index}
            x={col * CELL}
            y={row * CELL}
            width={CELL}
            height={CELL}
            className={`boardCell ${hasBg ? "withBg" : (col + row) % 2 === 0 ? "even" : "odd"}`}
          />
        );
      })}

      {/* подсветка дальности стойки; клетки за стеной — тусклые (кроме стиля паркура) */}
      {rangeLayers.map(({ token, spec, strong }) => {
        const ignoresWalls = ignoreWallsByToken[token.id];
        return (
          <g key={`range-${token.id}`} pointerEvents="none" opacity={strong ? 1 : 0.45}>
            {cellsInRange(spec, { x: token.x, y: token.y }, table.gridType, table.gridW, table.gridH).map((cell) => {
              const blocked = !ignoresWalls && crossesWall(table.gridType, table.gridW, table.gridH, { x: token.x, y: token.y }, cell, wallCells);
              const center = cellCenter(table.gridType, cell.x, cell.y);
              if (table.gridType === "hex") {
                return (
                  <polygon
                    key={`${cell.x}:${cell.y}`}
                    points={hexPolygonPoints(center)}
                    fill={token.color}
                    fillOpacity={blocked ? 0.05 : 0.2}
                    stroke={token.color}
                    strokeOpacity={blocked ? 0.15 : 0.55}
                    strokeWidth={1.5}
                  />
                );
              }
              return (
                <rect
                  key={`${cell.x}:${cell.y}`}
                  x={cell.x * CELL + 1.5}
                  y={cell.y * CELL + 1.5}
                  width={CELL - 3}
                  height={CELL - 3}
                  fill={token.color}
                  fillOpacity={blocked ? 0.05 : 0.2}
                  stroke={token.color}
                  strokeOpacity={blocked ? 0.15 : 0.55}
                  strokeWidth={1.5}
                />
              );
            })}
          </g>
        );
      })}

      {/* террейн: картинки токенов C0rked + метки-глифы; особая метка светится */}
      {terrain.map((token) => {
        const center = cellCenter(table.gridType, token.x, token.y);
        const marker = token.terrainType && isMarkerType(token.terrainType) ? markerMeta[token.terrainType] : undefined;
        const glowR = CELL / 2 - 3;
        if (marker) {
          return (
            <g key={token.id} pointerEvents="none">
              {token.variant && <circle cx={center.x} cy={center.y} r={glowR} className="specialTerrainGlow" style={{ color: marker.color }} />}
              <circle cx={center.x} cy={center.y} r={CELL / 2 - 8} fill={marker.color} fillOpacity={0.22} stroke={marker.color} strokeWidth={2} />
              <text x={center.x} y={center.y + 1} className="markerGlyph" style={{ fill: marker.color }} textAnchor="middle" dominantBaseline="middle">
                {marker.glyph}
              </text>
              <title>{token.name}{token.variant ? " (особая)" : ""}</title>
            </g>
          );
        }
        const w = CELL - 6;
        const h = (w / 284) * 320; // пропорции токенов C0rked
        return (
          <g key={token.id} pointerEvents="none">
            {token.variant && <circle cx={center.x} cy={center.y} r={glowR} className="specialTerrainGlow" />}
            <image
              className={`terrainImg terrain-${token.terrainType}`}
              href={`./terrain/${token.terrainType}.png`}
              x={center.x - w / 2}
              y={center.y - h / 2}
              width={w}
              height={h}
              opacity={0.94}
            >
              <title>{token.name}{token.variant ? " (особая)" : ""}</title>
            </image>
          </g>
        );
      })}

      {/* юниты */}
      {units.map((token) => {
        const strong = showOverlays || selectedId === token.id || activeTurnId === token.id;
        return (
          <UnitToken
            key={token.id}
            token={token}
            gridType={table.gridType}
            selected={selectedId === token.id}
            activeTurn={activeTurnId === token.id}
            overlay={strong ? "strong" : hoveredId === token.id ? "soft" : "off"}
            onPointerDown={(event) => {
              event.stopPropagation();
              handlePointerDown(event, token);
            }}
            onHover={(hovering) => setHoveredId((current) => (hovering ? token.id : current === token.id ? undefined : current))}
          />
        );
      })}

      {/* рисунки (и текущий черновик) — поверх токенов и террейна */}
      {[
        // Просроченные линии указки скрываем и у тех, кто их не рисовал (стирает автор).
        ...table.drawings.filter((drawing) => !drawing.expiresAt || Date.parse(drawing.expiresAt) > Date.now()),
        ...(draft && draft.length >= 4 ? [{ id: "draft", color: drawColor, points: draft, glow: drawGlow || undefined } satisfies Drawing] : []),
      ].map((drawing) => (
        <polyline
          key={drawing.id}
          className={drawing.glow ? "drawGlowLine" : undefined}
          style={drawing.glow ? { color: drawing.color } : undefined}
          points={pairs(drawing.points)}
          fill="none"
          stroke={drawing.color}
          strokeWidth={drawing.glow ? 4.5 : 3.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={drawing.glow ? 1 : 0.85}
          pointerEvents="none"
        />
      ))}

      {/* линейки */}
      {rulers.map((ruler, index) => {
        if (ruler.points.length < 2) return null;
        const last = ruler.points[ruler.points.length - 1];
        const prev = ruler.points[ruler.points.length - 2];
        const badgeAt = { x: (prev.x + last.x) / 2, y: (prev.y + last.y) / 2 - 14 };
        const showCost = ruler.cost !== ruler.cells;
        return (
          <g key={index} pointerEvents="none">
            <polyline
              points={ruler.points.map((point) => `${point.x},${point.y}`).join(" ")}
              fill="none"
              stroke={ruler.color}
              strokeWidth={3}
              strokeDasharray="7 5"
              strokeLinejoin="round"
            />
            {ruler.points.map((point, pointIndex) => (
              <circle key={pointIndex} cx={point.x} cy={point.y} r={5} fill={ruler.color} />
            ))}
            <g transform={`translate(${badgeAt.x}, ${badgeAt.y})`}>
              <rect x={showCost ? -44 : -26} y={-12} width={showCost ? 88 : 52} height={22} rx={11} className="rulerBadge" />
              <text textAnchor="middle" dominantBaseline="middle" className="rulerText">
                {ruler.cells} кл.{showCost ? ` · ${ruler.cost} жет.` : ""}
              </text>
            </g>
          </g>
        );
      })}

      {/* пинги */}
      {pings.map((ping) => (
        <g key={ping.id} className="pingFx" pointerEvents="none">
          <circle cx={ping.x} cy={ping.y} r={10} fill="none" stroke={ping.color} strokeWidth={4} className="pingRing" />
          <circle cx={ping.x} cy={ping.y} r={4} fill={ping.color} />
        </g>
      ))}
    </svg>
  );
}

// Фишка юнита: цветной круг или картинка; оверлей (кольцо HP и жетоны) —
// слегка при наведении (soft), в полную силу у выбранной/активной (strong).
function UnitToken({
  token,
  gridType,
  selected,
  activeTurn,
  overlay,
  onPointerDown,
  onHover,
}: {
  token: TableToken;
  gridType: TableState["gridType"];
  selected: boolean;
  activeTurn: boolean;
  overlay: "off" | "soft" | "strong";
  onPointerDown: (event: React.PointerEvent) => void;
  onHover: (hovering: boolean) => void;
}) {
  const center = cellCenter(gridType, token.x, token.y);
  const cx = center.x;
  const cy = center.y;
  const r = CELL / 2 - 8;
  const initials = token.name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
  const hpText = token.hpMax ? `${token.hpCurrent}/${token.hpMax}` : "";
  const down = (token.hpCurrent ?? 1) <= 0;
  const hpFrac = token.hpMax ? Math.max(0, Math.min(1, (token.hpCurrent ?? 0) / token.hpMax)) : 0;
  const hpColor = hpFrac > 0.5 ? "#59c98a" : hpFrac > 0.25 ? "#e0b13e" : "#e8654f";
  const ringR = CELL / 2 - 4;
  const ringLen = 2 * Math.PI * ringR;
  const activeCounters = counterTypes.filter((counter) => (token.counters?.[counter.id] ?? 0) > 0);

  return (
    <g
      className={`unitToken ${selected ? "selected" : ""} ${down ? "down" : ""} ${token.hidden ? "ghost" : ""} ${activeTurn ? "activeTurn" : ""}`}
      onPointerDown={onPointerDown}
      onPointerEnter={() => onHover(true)}
      onPointerLeave={() => onHover(false)}
    >
      {activeTurn && <circle cx={cx} cy={cy} r={CELL / 2 - 3} fill="none" className="activeTurnRing" />}
      <circle cx={cx} cy={cy} r={r} fill={token.color} className="unitCircle" />
      {token.image && (
        <>
          <clipPath id={`tokclip-${token.id}`}>
            <circle cx={cx} cy={cy} r={r - 1.5} />
          </clipPath>
          <image
            href={token.image}
            x={cx - r}
            y={cy - r}
            width={r * 2}
            height={r * 2}
            preserveAspectRatio="xMidYMid slice"
            clipPath={`url(#tokclip-${token.id})`}
          />
        </>
      )}
      {token.kind === "enemy" && !token.image && <circle cx={cx} cy={cy} r={r - 5} fill="none" className="enemyRing" />}
      {!token.image && (
        <text x={cx} y={cy + 1} className="unitInitials" textAnchor="middle" dominantBaseline="middle">
          {initials || "?"}
        </text>
      )}

      {/* упрощённое представление: кольцо HP вокруг фишки + жетоны сверху */}
      {overlay !== "off" && token.hpMax ? (
        <g opacity={overlay === "soft" ? 0.55 : 1}>
          <circle cx={cx} cy={cy} r={ringR} fill="none" className="hpRingBase" />
          <circle
            cx={cx}
            cy={cy}
            r={ringR}
            fill="none"
            stroke={hpColor}
            className="hpRingValue"
            strokeDasharray={`${ringLen * hpFrac} ${ringLen}`}
            transform={`rotate(-90 ${cx} ${cy})`}
          />
        </g>
      ) : null}
      {overlay !== "off" && activeCounters.length > 0 && (
        <g pointerEvents="none" opacity={overlay === "soft" ? 0.6 : 1}>
          {activeCounters.map((counter, index) => {
            // Жетоны — кольцом вокруг кольца HP, веером по верху (низ занят плашкой HP).
            const counterR = CELL / 2 + 9;
            const step = (38 * Math.PI) / 180;
            const angle = -Math.PI / 2 + (index - (activeCounters.length - 1) / 2) * step;
            const dotX = cx + counterR * Math.cos(angle);
            const dotY = cy + counterR * Math.sin(angle);
            const value = token.counters?.[counter.id] ?? 0;
            return (
              <g key={counter.id}>
                <circle cx={dotX} cy={dotY} r={7} fill={counter.color} className="counterDot" />
                <text x={dotX} y={dotY + 0.5} className="counterDotText" textAnchor="middle" dominantBaseline="middle">
                  {value}
                </text>
                <title>{counter.label}: {value}</title>
              </g>
            );
          })}
        </g>
      )}

      {hpText && (
        <>
          <rect x={cx - 22} y={cy + CELL / 2 - 19} width={44} height={15} rx={7.5} className="hpPill" />
          <text x={cx} y={cy + CELL / 2 - 11} className="hpText" textAnchor="middle" dominantBaseline="middle">
            {hpText}
          </text>
        </>
      )}
      {(token.shield ?? 0) > 0 && (
        <>
          <circle cx={cx + CELL / 2 - 14} cy={cy - CELL / 2 + 14} r={10} className="shieldBubble" />
          <text x={cx + CELL / 2 - 14} y={cy - CELL / 2 + 15} className="shieldText" textAnchor="middle" dominantBaseline="middle">
            {token.shield}
          </text>
        </>
      )}
      <title>{token.name}{token.hidden ? " (скрыт)" : ""}</title>
    </g>
  );
}

function pairs(points: number[]): string {
  const result: string[] = [];
  for (let i = 0; i + 1 < points.length; i += 2) result.push(`${points[i]},${points[i + 1]}`);
  return result.join(" ");
}

function isTerrainTool(tool: Tool): boolean {
  return tool !== "select" && tool !== "erase" && tool !== "ruler" && tool !== "ping" && tool !== "draw";
}
