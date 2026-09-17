import { useState, useMemo } from "react";
import type { Character, Chapter, Relationship } from "../data/jsonLoader";
import { BookOpen, Sparkles, GitBranch, BarChart2, Users, ChevronRight, PanelRight } from "lucide-react";

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
};

function getInitials(char: Character) {
  return INITIALS[char.id] || char.name.slice(0, 2).toUpperCase();
}

// ── Fixed pixel layout positions (on a 960×780 canvas) ───────────────────
const LAYOUT: Record<string, { x: number; y: number }> = {
  amudhan:  { x: 480, y: 100  },
  vennila:  { x: 220, y: 270  },
  valli:    { x: 740, y: 270  },
  vasu:     { x: 160, y: 470  },
  pallavi:  { x: 800, y: 470  },
  ezhil:    { x: 480, y: 490  },
  jeya:     { x: 310, y: 650  },
  raghavi:  { x: 650, y: 650  },
};

const HERO_R = 44;
const NODE_R = 32;

function getR(id: string) { return id === "amudhan" ? HERO_R : NODE_R; }

// ── SVG connector path between two nodes ─────────────────────────────────
function connectorPath(
  ax: number, ay: number, ar: number,
  bx: number, by: number, br: number
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
  const curvature = Math.min(dist * 0.18, 55);
  const cx1 = sx + nx * dist * 0.35 + perpX * curvature;
  const cy1 = sy + ny * dist * 0.35 + perpY * curvature;
  const cx2 = sx + nx * dist * 0.65 + perpX * curvature;
  const cy2 = sy + ny * dist * 0.65 + perpY * curvature;
  return `M ${sx} ${sy} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${ex} ${ey}`;
}

function bezierMid(
  ax: number, ay: number, ar: number,
  bx: number, by: number, br: number
): { x: number; y: number } {
  const dx = bx - ax;
  const dy = by - ay;
  const dist = Math.sqrt(dx * dx + dy * dy) || 1;
  const nx = dx / dist;
  const ny = dy / dist;
  const perpX = -ny;
  const perpY = nx;
  const curvature = Math.min(dist * 0.18, 55);
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

  const links = useMemo(() => {
    return relationships
      .map((rel) => {
        const src = nodeMap.get(rel.source);
        const tgt = nodeMap.get(rel.target);
        if (!src || !tgt) return null;
        const srcPos = LAYOUT[rel.source];
        const tgtPos = LAYOUT[rel.target];
        if (!srcPos || !tgtPos) return null;
        return { ...rel, src, tgt, srcPos, tgtPos };
      })
      .filter(Boolean) as (Relationship & {
        src: Character; tgt: Character;
        srcPos: { x: number; y: number };
        tgtPos: { x: number; y: number };
      })[];
  }, [relationships, nodeMap]);

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
    { key: "conflict",  label: "Butterfly Effect", color: "#E74C3C" },
  ];

  return (
    <div className="ct-shell">

      {/* ── LEFT: Tree canvas ───────────────────────────────────────── */}
      <div className="ct-canvas-col">

        {/* HUD bar */}
        <div className="ct-hud">
          <div className="ct-hud-brand">
            <GitBranch size={15} className="ct-hud-icon" />
            <span className="ct-hud-title">CHARACTER TREE</span>
            <span className="ct-hud-badge">AMUDHAPURANAM</span>
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
          </div>
        </div>

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
            {links.map((l) => {
              const relType = (l.type || "").toLowerCase();
              const cfg = getRelConfig(relType);
              const sr = getR(l.source);
              const tr = getR(l.target);
              const isActive = !activeFilter || relType === activeFilter;
              const isHl = hoveredId
                ? l.source === hoveredId || l.target === hoveredId
                : isActive;
              const opacity = !isActive ? 0.05 : isHl ? 1 : 0.35;
              const mid = bezierMid(l.srcPos.x, l.srcPos.y, sr, l.tgtPos.x, l.tgtPos.y, tr);
              const pathD = connectorPath(l.srcPos.x, l.srcPos.y, sr, l.tgtPos.x, l.tgtPos.y, tr);
              const markerKey = relType in REL_CONFIG ? relType : "default";

              return (
                <g key={l.id} style={{ opacity, transition: "opacity 0.3s" }}>
                  {/* Clean flat connector */}
                  <path
                    d={pathD} fill="none"
                    stroke={cfg.color}
                    strokeWidth={isHl ? 2.2 : 1.6}
                    strokeOpacity={isHl ? 0.95 : 0.6}
                    strokeDasharray={cfg.dash}
                    strokeLinecap="round"
                    markerEnd={`url(#ct-arr-${markerKey})`}
                  />
                  {/* Mid-point label — shown only on hover */}
                  {isHl && isActive && (
                    <g transform={`translate(${mid.x}, ${mid.y})`}>
                      <rect
                        x={-(l.label.length * 3.2 + 8)} y={-10}
                        width={l.label.length * 6.4 + 16} height={20}
                        rx={10}
                        fill="var(--card-bg)"
                        stroke={cfg.color} strokeWidth={1.2}
                      />
                      <text
                        fill={cfg.color} fontSize="9" fontWeight="700"
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
              const pos = LAYOUT[char.id];
              if (!pos) return null;
              const isHero = char.id === "amudhan";
              const r = getR(char.id);
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
                  style={{ cursor: "pointer", opacity: dim ? 0.15 : 1, transition: "opacity 0.28s" }}
                  onMouseEnter={() => setHoveredId(char.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  onClick={() => { setSelectedId(char.id); setPanelOpen(true); }}
                >
                  {/* Crisp selection ring — no blur */}
                  {(isSelected || isHovered) && (
                    <circle cx={pos.x} cy={pos.y} r={r + 6} fill="none"
                      stroke={char.color}
                      strokeWidth={isSelected ? 2 : 1.4}
                      strokeOpacity={isSelected ? 0.85 : 0.5}
                      strokeDasharray={isSelected ? undefined : "4,3"}
                    />
                  )}
                  {/* Main filled circle */}
                  <circle cx={pos.x} cy={pos.y} r={r}
                    fill="var(--card-bg)"
                    stroke={char.color}
                    strokeWidth={isHero ? 3 : 2.2}
                  />
                  {/* Initials */}
                  <text
                    x={pos.x} y={pos.y}
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
                    x={pos.x} y={pos.y + r + 15}
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
                    x={pos.x} y={pos.y + r + 27}
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
          <span className="ct-side-badge">LIVE</span>
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
                  <div key={rel.id} className="ct-rel-pill" onClick={() => setSelectedId(other.id)}>
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
