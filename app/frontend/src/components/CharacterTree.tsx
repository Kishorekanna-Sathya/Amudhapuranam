import { useState, useMemo } from "react";
import type { Character, Chapter, Relationship } from "../data/jsonLoader";
import { BookOpen, Sparkles, GitBranch, BarChart2, Users, ChevronRight, PanelRight, X } from "lucide-react";

interface Props {
  characters: Character[];
  chapters: Chapter[];
  relationships: Relationship[];
  editMode: boolean;
  searchHighlightIds?: string[];
  onNodeClick: (char: Character) => void;
  onTagClick: (chapterId: string) => void;
}

// ── Relationship type config ───────────────────────────────────────────
const REL_CONFIG: Record<string, { color: string; label: string; dash?: string }> = {
  friend:    { color: "#C4552F", label: "Friends" },         // terracotta accent
  alliance:  { color: "#27AE60", label: "Love Interest" },   // emerald green
  love:      { color: "#D35400", label: "Love" },            // warm terracotta
  family:    { color: "#6C5CE7", label: "Siblings" },        // vibrant purple
  parent:    { color: "#F5A623", label: "Family", dash: "4,3" }, // warm amber — Mom & Dad
  marriage:  { color: "#FD79A8", label: "Husband & Wife", dash: "5,3" },
  conflict:  { color: "#E74C3C", label: "Butterfly Effect", dash: "6,4" }, // crimson coral
  default:   { color: "#2575FC", label: "Connected" },       // royal blue
};

function getRelConfig(type: string) {
  return REL_CONFIG[(type || "").toLowerCase()] || REL_CONFIG.default;
}

// ── Character initials map ────────────────────────────────────────────────
const INITIALS: Record<string, string> = {
  amudhan:  "A",
  vennila:  "VN",
  valli:    "VL",
  vasu:     "VS",
  ezhil:    "EZ",
  raghavi:  "RG",
  jeya:     "JY",
  pallavi:  "PL",
  mom:      "SV",
  dad:      "SN",
  kayal:    "KY",
};

function getInitials(char: Character) {
  return INITIALS[char.id] || char.name.slice(0, 2).toUpperCase();
}

// ── Fixed pixel layout positions (on a 960×780 canvas) ───────────────────
const LAYOUT: Record<string, { x: number; y: number }> = {
  // Center Stage: Protagonist
  amudhan:  { x: 480, y: 320 },

  // Top Tier: Family
  mom:      { x: 300, y: 130 },
  dad:      { x: 480, y: 120 },
  kayal:    { x: 660, y: 130 },

  // Middle Tier: Primary Inner Circle & Romances
  vennila:  { x: 170, y: 320 },
  vasu:     { x: 790, y: 320 },
  valli:    { x: 260, y: 500 },
  jeya:     { x: 480, y: 500 },
  pallavi:  { x: 700, y: 500 },

  // Bottom Tier: Catalysts & Allies
  ezhil:    { x: 370, y: 670 },
  raghavi:  { x: 590, y: 670 },
};

const HERO_R = 42;
const NODE_R = 30;

function getR(id: string, selectedId: string) { return id === selectedId ? HERO_R : NODE_R; }

// ── SVG connector path between two nodes with curve staggering ───────────
function connectorPath(
  ax: number, ay: number, ar: number,
  bx: number, by: number, br: number,
  linkIdx: number = 0
): string {
  const dx = bx - ax;
  const dy = by - ay;
  const dist = Math.sqrt(dx * dx + dy * dy) || 1;
  const nx = dx / dist;
  const ny = dy / dist;
  const sx = ax + nx * (ar + 2);
  const sy = ay + ny * (ar + 2);
  const ex = bx - nx * (br + 2);
  const ey = by - ny * (br + 2);
  const perpX = -ny;
  const perpY = nx;
  
  // Stagger curvature direction & distance for multi-edges
  const curveDir = (linkIdx % 2 === 0) ? 1 : -1;
  const curvature = Math.min(dist * 0.18, 50) * curveDir + (linkIdx % 3) * 8;
  
  const cx1 = sx + nx * dist * 0.35 + perpX * curvature;
  const cy1 = sy + ny * dist * 0.35 + perpY * curvature;
  const cx2 = sx + nx * dist * 0.65 + perpX * curvature;
  const cy2 = sy + ny * dist * 0.65 + perpY * curvature;
  return `M ${sx} ${sy} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${ex} ${ey}`;
}

function bezierMid(
  ax: number, ay: number, ar: number,
  bx: number, by: number, br: number,
  linkIdx: number = 0
): { x: number; y: number } {
  const dx = bx - ax;
  const dy = by - ay;
  const dist = Math.sqrt(dx * dx + dy * dy) || 1;
  const nx = dx / dist;
  const ny = dy / dist;
  const perpX = -ny;
  const perpY = nx;
  
  const curveDir = (linkIdx % 2 === 0) ? 1 : -1;
  const curvature = Math.min(dist * 0.18, 50) * curveDir + (linkIdx % 3) * 8;
  
  const sx = ax + nx * (ar + 2);
  const sy = ay + ny * (ar + 2);
  const ex = bx - nx * (br + 2);
  const ey = by - ny * (br + 2);
  const cx1 = sx + nx * dist * 0.35 + perpX * curvature;
  const cy1 = sy + ny * dist * 0.35 + perpY * curvature;
  const cx2 = sx + nx * dist * 0.65 + perpX * curvature;
  const cy2 = sy + ny * dist * 0.65 + perpY * curvature;
  const t = 0.5;
  const mt = 1 - t;
  const x = mt*mt*mt*sx + 3*mt*mt*t*cx1 + 3*mt*t*t*cx2 + t*t*t*ex;
  const y = mt*mt*mt*sy + 3*mt*mt*t*cy1 + 3*mt*t*t*cy2 + t*t*t*ey;
  return { x, y };
}

// ═══════════════════════════════════════════════════════════════════════════
export default function CharacterTree({
  characters,
  chapters,
  relationships,
  searchHighlightIds = [],
  onTagClick,
}: Props) {
  const [selectedId, setSelectedId] = useState<string>("amudhan");
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState<boolean>(false);

  const W = 960;
  const H = 780;

  const nodeMap = useMemo(() => {
    const m = new Map<string, Character>();
    characters.forEach((c) => m.set(c.id, c));
    return m;
  }, [characters]);

  // ── Layout calculation with optimal spacing ───────────────────────────
  const layoutPositions = useMemo(() => {
    // Return structured default tree layout when Amudhan is centered
    if (selectedId === "amudhan") {
      const res: Record<string, { x: number; y: number }> = {};
      characters.forEach((c) => {
        res[c.id] = LAYOUT[c.id] || { x: 480, y: 390 };
      });
      return res;
    }

    // Dynamic 2-ring orbital layout when another node is selected
    const result: Record<string, { x: number; y: number }> = {};
    const focusX = W / 2; // 480
    const focusY = H / 2; // 390

    result[selectedId] = { x: focusX, y: focusY };

    const neighborsSet = new Set<string>();
    relationships.forEach((rel) => {
      if (rel.source === selectedId) neighborsSet.add(rel.target);
      else if (rel.target === selectedId) neighborsSet.add(rel.source);
    });
    const neighbors = Array.from(neighborsSet);
    const remaining = characters
      .map((c) => c.id)
      .filter((id) => id !== selectedId && !neighborsSet.has(id));

    // Staggered 2-ring orbit for neighbors so nodes never collide
    if (neighbors.length > 0) {
      neighbors.forEach((id, idx) => {
        const r = idx % 2 === 0 ? 250 : 370;
        const angle = -Math.PI / 2 + (idx / neighbors.length) * 2 * Math.PI;
        const x = focusX + r * Math.cos(angle);
        const y = focusY + r * Math.sin(angle);
        result[id] = { x: Math.round(x), y: Math.round(y) };
      });
    }

    // Outer perimeter for non-neighbors
    if (remaining.length > 0) {
      const rOuter = 460;
      remaining.forEach((id, idx) => {
        const angle = (idx / remaining.length) * 2 * Math.PI;
        const x = focusX + rOuter * Math.cos(angle);
        const y = focusY + rOuter * Math.sin(angle);
        result[id] = { x: Math.round(x), y: Math.round(y) };
      });
    }

    characters.forEach((c) => {
      if (!result[c.id]) {
        result[c.id] = LAYOUT[c.id] || { x: 480, y: 390 };
      }
    });

    return result;
  }, [selectedId, characters, relationships, W, H]);

  const links = useMemo(() => {
    return relationships
      .map((rel) => {
        const src = nodeMap.get(rel.source);
        const tgt = nodeMap.get(rel.target);
        if (!src || !tgt) return null;
        const srcPos = layoutPositions[rel.source];
        const tgtPos = layoutPositions[rel.target];
        if (!srcPos || !tgtPos) return null;
        return { ...rel, src, tgt, srcPos, tgtPos };
      })
      .filter(Boolean) as (Relationship & {
        src: Character; tgt: Character;
        srcPos: { x: number; y: number };
        tgtPos: { x: number; y: number };
      })[];
  }, [relationships, nodeMap, layoutPositions]);

  const selectedChar = nodeMap.get(selectedId) || characters[0];
  const selChapters = useMemo(() =>
    chapters.filter((ch) => ch.characters?.includes(selectedId)),
    [chapters, selectedId]
  );
  const selRels = useMemo(() =>
    links.filter((l) => l.source === selectedId || l.target === selectedId),
    [links, selectedId]
  );

  const connectedToHover = useMemo(() => {
    if (!hoveredId) return new Set<string>();
    const s = new Set<string>([hoveredId]);
    links.forEach((l) => {
      if (l.source === hoveredId) s.add(l.target);
      if (l.target === hoveredId) s.add(l.source);
    });
    return s;
  }, [hoveredId, links]);

  const filterTypes = [
    { key: null,        label: "All" },
    { key: "friend",    label: "Friends",          color: "#C4552F" },
    { key: "alliance",  label: "Love Interest",    color: "#27AE60" },
    { key: "family",    label: "Siblings",         color: "#6C5CE7" },
    { key: "parent",    label: "Parents",          color: "#F5A623" },
    { key: "marriage",  label: "Married",          color: "#FD79A8" },
    { key: "conflict",  label: "Butterfly Effect", color: "#E74C3C" },
  ];

  return (
    <div className="ct-shell">

      {/* ── FILTER HUD — direct child of shell so it's always visible ─── */}
      <div className="ct-hud">
        <div className="ct-hud-brand">
          <GitBranch size={15} className="ct-hud-icon" />
          <span className="ct-hud-title">CHARACTER TREE</span>
          <span className="ct-hud-badge">CENTER: {selectedChar.name.toUpperCase()}</span>
        </div>
        <div className="ct-filter-row">
          {filterTypes.map(({ key, label, color }) => (
            <button
              key={String(key)}
              className={`ct-pill ${activeFilter === key ? "active" : ""}`}
              style={{ "--pc": color || "var(--accent)" } as React.CSSProperties}
              onClick={() => setActiveFilter(activeFilter === key ? null : key)}
            >
              {color && <span className="ct-pill-dot" style={{ background: color }} />}
              {label}
            </button>
          ))}
          {selectedId !== "amudhan" && (
            <button
              className="ct-pill"
              onClick={() => setSelectedId("amudhan")}
              style={{ "--pc": "var(--accent)" } as React.CSSProperties}
              title="Reset focal point to Amudhan"
            >
              ↺ Reset
            </button>
          )}
        </div>
      </div>

      {/* ── LEFT: Tree canvas ───────────────────────────────────────── */}
      <div className="ct-canvas-col">
        {/* SVG Tree */}
        <div className="ct-svg-wrap">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            width="100%"
            height="100%"
            xmlns="http://www.w3.org/2000/svg"
            style={{ overflow: "visible" }}
          >
            <defs>
              <pattern id="ct-dots" x="0" y="0" width="32" height="32" patternUnits="userSpaceOnUse">
                <circle cx="1" cy="1" r="1.5" fill="var(--border-strong)" opacity="0.5" />
              </pattern>
              {/* Arrowhead markers per relationship type */}
              {Object.entries(REL_CONFIG).map(([type, cfg]) => (
                <marker
                  key={type}
                  id={`ct-arr-${type}`}
                  viewBox="0 0 12 12"
                  refX="10" refY="6"
                  markerWidth="8" markerHeight="8"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 1 L 10 6 L 0 11 L 3 6 Z" fill={cfg.color} opacity="1" />
                </marker>
              ))}
            </defs>

            <rect width={W} height={H} fill="url(#ct-dots)" />

            {/* ── LINKS ── */}
            {links.map((l, lIdx) => {
              const relType = (l.type || "").toLowerCase();
              const cfg = getRelConfig(relType);
              const sr = getR(l.source, selectedId);
              const tr = getR(l.target, selectedId);
              const isActive = !activeFilter || relType === activeFilter;
              
              // Only show label pills when hovered, or filter is active
              const isHl = hoveredId
                ? l.source === hoveredId || l.target === hoveredId
                : activeFilter
                ? relType === activeFilter
                : false;

              const opacity = !isActive ? 0.04 : (hoveredId ? (isHl ? 1 : 0.2) : (activeFilter ? 1 : 0.45));
              const mid = bezierMid(l.srcPos.x, l.srcPos.y, sr, l.tgtPos.x, l.tgtPos.y, tr, lIdx);
              const pathD = connectorPath(l.srcPos.x, l.srcPos.y, sr, l.tgtPos.x, l.tgtPos.y, tr, lIdx);
              const markerKey = relType in REL_CONFIG ? relType : "default";

              return (
                <g key={l.id} style={{ opacity, transition: "opacity 0.3s" }}>
                  {/* Clean connector line */}
                  <path
                    d={pathD} fill="none"
                    stroke={cfg.color}
                    strokeWidth={isHl ? 2.5 : 1.6}
                    strokeOpacity={isHl ? 0.95 : 0.55}
                    strokeDasharray={cfg.dash}
                    strokeLinecap="round"
                    markerEnd={`url(#ct-arr-${markerKey})`}
                    style={{ transition: "d 0.5s cubic-bezier(0.2, 0.8, 0.2, 1), stroke 0.3s", pointerEvents: "none" }}
                  />
                  {/* Mid-point relationship label — shown when hovered or filtered */}
                  {isHl && isActive && (
                    <g
                      transform={`translate(${mid.x}, ${mid.y})`}
                      style={{ transition: "transform 0.5s cubic-bezier(0.2, 0.8, 0.2, 1)", cursor: "pointer" }}
                      onClick={(e) => {
                        e.stopPropagation();
                        const tgtId = l.source === selectedId ? l.target : l.source;
                        setSelectedId(tgtId);
                        setPanelOpen(true);
                      }}
                    >
                      <rect
                        x={-(l.label.length * 3.4 + 10)} y={-11}
                        width={l.label.length * 6.8 + 20} height={22}
                        rx={11}
                        fill="var(--card-bg)"
                        stroke={cfg.color} strokeWidth={1.4}
                      />
                      <text
                        fill={cfg.color} fontSize="9.5" fontWeight="700"
                        fontFamily="var(--font-ui)"
                        textAnchor="middle" dy="0.35em" letterSpacing="0.03em"
                      >
                        {l.label}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}

            {/* ── NODES ── */}
            {characters.map((char) => {
              const pos = layoutPositions[char.id];
              if (!pos) return null;
              const isHero = char.id === selectedId;
              const r = getR(char.id, selectedId);
              const isSelected = selectedId === char.id;
              const isHovered = hoveredId === char.id;
              const isConnected = connectedToHover.has(char.id);
              const isDimmed = hoveredId != null && !isConnected;
              const isSearchDim = searchHighlightIds.length > 0 && !searchHighlightIds.includes(char.id);
              const dim = isDimmed || isSearchDim;
              const charChaps = chapters.filter((ch) => ch.characters?.includes(char.id));

              return (
                <g
                  key={char.id}
                  transform={`translate(${pos.x}, ${pos.y})`}
                  style={{
                    cursor: "pointer",
                    opacity: dim ? 0.15 : 1,
                    transition: "transform 0.5s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.28s",
                  }}
                  onMouseEnter={() => setHoveredId(char.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedId(char.id);
                    setPanelOpen(true);
                  }}
                  onTouchEnd={(e) => {
                    e.stopPropagation();
                    setSelectedId(char.id);
                    setPanelOpen(true);
                  }}
                >
                  {/* Invisible expanded touch target circle for mobile fingers */}
                  <circle cx={0} cy={0} r={r + 20} fill="transparent" style={{ cursor: "pointer" }} />

                  {/* Crisp selection ring — no blur */}
                  {(isSelected || isHovered) && (
                    <circle cx={0} cy={0} r={r + 6} fill="none"
                      stroke={char.color}
                      strokeWidth={isSelected ? 2 : 1.4}
                      strokeOpacity={isSelected ? 0.85 : 0.5}
                      strokeDasharray={isSelected ? undefined : "4,3"}
                    />
                  )}
                  {/* Main filled circle */}
                  <circle cx={0} cy={0} r={r}
                    fill="var(--card-bg)"
                    stroke={char.color}
                    strokeWidth={isHero ? 3 : 2.2}
                  />
                  {/* Initials */}
                  <text
                    x={0} y={0}
                    textAnchor="middle" dominantBaseline="central"
                    fill={char.color}
                    fontSize={isHero ? 19 : 13}
                    fontWeight="800"
                    fontFamily="var(--font-ui)"
                    letterSpacing="-0.01em"
                  >
                    {getInitials(char)}
                  </text>
                  {/* Name */}
                  <text
                    x={0} y={r + 15}
                    textAnchor="middle"
                    fill="var(--text-primary)"
                    fontSize={isHero ? 12 : 11}
                    fontWeight={isHero ? "700" : "600"}
                    fontFamily="var(--font-ui)"
                  >
                    {char.name}
                  </text>
                  {/* Sub-label */}
                  <text
                    x={0} y={r + 27}
                    textAnchor="middle"
                    fill="var(--text-secondary)"
                    fontSize="9"
                    fontWeight="500"
                    fontFamily="var(--font-ui)"
                  >
                    {char.role ? char.role : `${charChaps.length} stories`}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        <div className="ct-hint">
          Tap a node to inspect · Hover to highlight connections
        </div>

        {/* Mobile panel toggle */}
        <button
          className="ct-panel-toggle"
          onClick={() => setPanelOpen((v) => !v)}
          aria-label="Toggle inspector panel"
        >
          <PanelRight size={16} />
          <span>Inspector</span>
        </button>
      </div>

      {/* ── RIGHT: Story inspector panel ────────────────────────────── */}
      <div className={`ct-side ${panelOpen ? "open" : ""}`}>
        <div className="ct-side-header">
          <div className="ct-side-title">
            <BarChart2 size={15} />
            <span>Story Inspector</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="ct-side-badge">LIVE</span>
            <button
              className="ct-close-btn"
              onClick={() => setPanelOpen(false)}
              title="Close inspector"
              style={{
                background: "none",
                border: "none",
                color: "var(--text-secondary)",
                cursor: "pointer",
                padding: 4,
                borderRadius: 4,
                display: "flex",
                alignItems: "center"
              }}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {selectedChar && (
          <div className="ct-char-card" style={{ borderLeftColor: selectedChar.color }}>
            <div className="ct-char-head">
              <div
                className="ct-char-avatar"
                style={{
                  background: `linear-gradient(135deg, ${selectedChar.color}33, ${selectedChar.color}11)`,
                  borderColor: selectedChar.color,
                  color: selectedChar.color,
                }}
              >
                {getInitials(selectedChar)}
              </div>
              <div>
                <div className="ct-char-name" style={{ color: selectedChar.color }}>
                  {selectedChar.name}
                  {selectedChar.id === "amudhan" && (
                    <Sparkles size={12} style={{ color: "var(--accent)", marginLeft: 5, display: "inline" }} />
                  )}
                </div>
                {selectedChar.role && (
                  <div className="ct-char-role">{selectedChar.role}</div>
                )}
              </div>
            </div>

            {selectedChar.description && (
              <div className="ct-char-desc">{selectedChar.description}</div>
            )}

            <div className="ct-section-label">
              <Users size={11} />
              CONNECTIONS ({selRels.length})
            </div>
            <div className="ct-rels">
              {selRels.map((rel) => {
                const otherId = rel.source === selectedId ? rel.target : rel.source;
                const other = nodeMap.get(otherId);
                if (!other) return null;
                const cfg = getRelConfig((rel.type || "").toLowerCase());
                return (
                  <div
                    key={rel.id}
                    className="ct-rel-pill"
                    onClick={() => setSelectedId(other.id)}
                    title={rel.description || `${other.name} (${rel.label})`}
                  >
                    <span className="ct-rel-dot" style={{ background: cfg.color }} />
                    <span className="ct-rel-name">{other.name}</span>
                    <span className="ct-rel-type" style={{ color: cfg.color }}>{rel.label}</span>
                  </div>
                );
              })}
            </div>

            <div className="ct-section-label">
              <BookOpen size={11} />
              FEATURED STORIES ({selChapters.length})
            </div>
            <div className="ct-chapters">
              {selChapters.map((ch) => (
                <div key={ch.id} className="ct-chap-card" onClick={() => onTagClick(ch.id)}>
                  <div className="ct-chap-info">
                    <div className="ct-chap-tamil">{ch.title}</div>
                    <div className="ct-chap-en">{ch.titleEn}</div>
                  </div>
                  <div className="ct-read-btn">
                    READ <ChevronRight size={12} />
                  </div>
                </div>
              ))}
              {selChapters.length === 0 && (
                <div className="ct-empty-stories">No featured stories yet.</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
