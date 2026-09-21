import { useState, useMemo, useRef, useEffect } from "react";
import type { Character, Chapter, Relationship } from "../data/jsonLoader";
import { ZoomIn, ZoomOut, RefreshCw, BookOpen, Sparkles, Compass, Layers, Activity } from "lucide-react";

interface Props {
  characters: Character[];
  chapters: Chapter[];
  relationships: Relationship[];
  editMode: boolean;
  searchHighlightIds: string[];
  onNodeClick: (char: Character) => void;
  onTagClick: (chapterId: string) => void;
}

interface NodePos {
  character: Character;
  cx: number;
  cy: number;
  r: number;
  angle: number;
  isHero: boolean;
}

const REL_COLORS: Record<string, { color: string; label: string }> = {
  friend: { color: "#f5d233", label: "Friends" },
  alliance: { color: "#2ce6cc", label: "Love Interest" },
  family: { color: "#e87fcc", label: "Siblings" },
  parent: { color: "#F5A623", label: "Parents" },
  marriage: { color: "#FD79A8", label: "Husband & Wife" },
  conflict: { color: "#ff5555", label: "Butterfly Effect" },
  default: { color: "#4895d4", label: "Relationship" },
};

const CHARACTER_INITIALS: Record<string, string> = {
  amudhan: "A",
  vennila: "VN",
  valli: "VL",
  vasu: "VS",
  ezhil: "EZ",
  raghavi: "RG",
  jeya: "JY",
  pallavi: "PL",
  mom: "SV",
  dad: "SN",
  kayal: "KY",
};

export default function ForceGraph({
  characters,
  chapters,
  relationships,
  searchHighlightIds,
  onTagClick,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(0.9);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [selectedChar, setSelectedChar] = useState<Character | null>(null);
  const [hoveredCharId, setHoveredCharId] = useState<string | null>(null);
  const [activeRelFilter, setActiveRelFilter] = useState<string | null>(null);

  // Canvas dimensions
  const CANVAS_W = 980;
  const CANVAS_H = 820;
  const CENTER_X = CANVAS_W / 2;
  const CENTER_Y = CANVAS_H / 2;

  // Compute Mathematically Perfect Equal Radial Orbit Layout
  const { nodePosList, linkList } = useMemo(() => {
    if (!characters || characters.length === 0) {
      return { nodePosList: [], nodeMap: new Map(), linkList: [] };
    }

    const map = new Map<string, NodePos>();
    const list: NodePos[] = [];

    const HERO_R = 34; // Amudhan Center Hero Circle
    const NODE_R = 24; // Surrounding Circle Nodes

    const amudhanChar = characters.find((c) => c.id === "amudhan") || characters[0];
    const surroundingChars = characters.filter((c) => c.id !== amudhanChar.id);

    // 1. Center Hero Node (Amudhan)
    const amudhanPos: NodePos = {
      character: amudhanChar,
      cx: CENTER_X,
      cy: CENTER_Y,
      r: HERO_R,
      angle: 0,
      isHero: true,
    };
    map.set(amudhanChar.id, amudhanPos);
    list.push(amudhanPos);

    // 2. Surround 7 Characters with Equal Angular Steps (360 / 7 = 51.4 degrees)
    surroundingChars.forEach((char, idx) => {
      const ORBIT_RADIUS = idx % 2 === 0 ? 250 : 370;
      const totalSurrounding = surroundingChars.length;

      // Start at North (-pi/2) and step clockwise
      const angle = -Math.PI / 2 + (idx * (2 * Math.PI)) / totalSurrounding;
      const cx = CENTER_X + ORBIT_RADIUS * Math.cos(angle);
      const cy = CENTER_Y + ORBIT_RADIUS * Math.sin(angle);

      const nodePos: NodePos = {
        character: char,
        cx,
        cy,
        r: NODE_R,
        angle,
        isHero: false,
      };
      map.set(char.id, nodePos);
      list.push(nodePos);
    });

    // Node Boundary Intersection Point for Edge Connections
    function getNodeEdgePoint(
      fromCenter: { x: number; y: number },
      toCenter: { x: number; y: number },
      radius: number
    ) {
      const dx = toCenter.x - fromCenter.x;
      const dy = toCenter.y - fromCenter.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      return {
        x: fromCenter.x + (dx / dist) * (radius + 4),
        y: fromCenter.y + (dy / dist) * (radius + 4),
      };
    }

    const links = relationships.map((rel) => {
      const sourceNode = map.get(rel.source);
      const targetNode = map.get(rel.target);

      if (!sourceNode || !targetNode) return null;

      const p1 = getNodeEdgePoint(
        { x: sourceNode.cx, y: sourceNode.cy },
        { x: targetNode.cx, y: targetNode.cy },
        sourceNode.r
      );
      const p2 = getNodeEdgePoint(
        { x: targetNode.cx, y: targetNode.cy },
        { x: sourceNode.cx, y: sourceNode.cy },
        targetNode.r
      );

      // Smooth Curved Bezier
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      const normX = -dy / (dist || 1);
      const normY = dx / (dist || 1);
      const curvature = Math.min(22, dist * 0.08);

      const cx1 = p1.x + dx * 0.35 + normX * curvature;
      const cy1 = p1.y + dy * 0.35 + normY * curvature;
      const cx2 = p1.x + dx * 0.65 + normX * curvature;
      const cy2 = p1.y + dy * 0.65 + normY * curvature;

      const midX = 0.125 * p1.x + 0.375 * cx1 + 0.375 * cx2 + 0.125 * p2.x;
      const midY = 0.125 * p1.y + 0.375 * cy1 + 0.375 * cy2 + 0.125 * p2.y;

      const pathD = `M ${p1.x} ${p1.y} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${p2.x} ${p2.y}`;

      return {
        ...rel,
        sourceNode,
        targetNode,
        x1: p1.x,
        y1: p1.y,
        x2: p2.x,
        y2: p2.y,
        midX,
        midY,
        pathD,
      };
    }).filter(Boolean);

    return { nodePosList: list, nodeMap: map, linkList: links as any[] };
  }, [characters, relationships]);

  // Default selection to Amudhan on mount
  useEffect(() => {
    if (characters.length > 0 && !selectedChar) {
      const amudhan = characters.find((c) => c.id === "amudhan") || characters[0];
      setSelectedChar(amudhan);
    }
  }, [characters]);

  // Center view on mount
  useEffect(() => {
    if (containerRef.current) {
      const containerW = containerRef.current.clientWidth;
      const containerH = containerRef.current.clientHeight;
      setPan({
        x: (containerW - CANVAS_W * zoom) / 2,
        y: (containerH - CANVAS_H * zoom) / 2,
      });
    }
  }, []);

  // Pan handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest(".sigma-node-group")) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  };

  const handleMouseUp = () => setIsDragging(false);

  const resetView = () => {
    const containerW = containerRef.current?.clientWidth || 700;
    const containerH = containerRef.current?.clientHeight || 600;
    setZoom(0.9);
    setPan({
      x: (containerW - CANVAS_W * 0.9) / 2,
      y: (containerH - CANVAS_H * 0.9) / 2,
    });
  };

  // Active highlights
  const activeLinkIds = useMemo(() => {
    const set = new Set<string>();
    linkList.forEach((l) => {
      const relType = (l.type || "").toLowerCase();
      if (activeRelFilter && relType !== activeRelFilter) return;

      if (hoveredCharId) {
        if (l.source === hoveredCharId || l.target === hoveredCharId) {
          set.add(l.id);
        }
      } else if (!activeRelFilter) {
        set.add(l.id);
      } else {
        set.add(l.id);
      }
    });
    return set;
  }, [hoveredCharId, activeRelFilter, linkList]);

  const activeCharIds = useMemo(() => {
    if (!hoveredCharId) return new Set<string>();
    const set = new Set<string>([hoveredCharId]);
    linkList.forEach((l) => {
      if (l.source === hoveredCharId) set.add(l.target);
      if (l.target === hoveredCharId) set.add(l.source);
    });
    return set;
  }, [hoveredCharId, linkList]);

  // Selected character & hovered character info for analysis panel
  const activeCharObj = selectedChar || (hoveredCharId ? characters.find((c) => c.id === hoveredCharId) || null : null);

  const activeCharChapters = useMemo(() => {
    if (!activeCharObj) return [];
    return chapters.filter((ch) => Array.isArray(ch.characters) && ch.characters.includes(activeCharObj.id));
  }, [activeCharObj, chapters]);

  // Connected relationships for active character
  const activeCharRels = useMemo(() => {
    if (!activeCharObj) return [];
    return linkList.filter((l) => l.source === activeCharObj.id || l.target === activeCharObj.id);
  }, [activeCharObj, linkList]);

  return (
    <div className="sigma-graph-wrapper">
      {/* ── MAIN DASHBOARD CONTAINER ── */}
      <div className="sigma-main-area">
        {/* LEFT / CENTER: GRAPH CANVAS */}
        <div className="sigma-canvas-box">
          {/* Top Integrated Header HUD */}
          <div className="sigma-hud-header">
            <div className="hud-title-wrap">
              <Activity size={17} className="hud-icon" />
              <span className="hud-main-title">CHARACTERS NETWORK TREE</span>
              <span className="hud-sub-badge">EQUAL RADIAL DISTRIBUTED</span>
            </div>

            {/* Filter Pills */}
            <div className="hud-filter-group">
              <button
                className={`hud-pill ${activeRelFilter === null ? "active" : ""}`}
                onClick={() => setActiveRelFilter(null)}
              >
                All Connections
              </button>
              <button
                className={`hud-pill ${activeRelFilter === "friend" ? "active" : ""}`}
                style={{ "--pill-color": "#f5d233" } as React.CSSProperties}
                onClick={() => setActiveRelFilter(activeRelFilter === "friend" ? null : "friend")}
              >
                <span className="pill-dot" style={{ background: "#f5d233" }} />
                Friends
              </button>
              <button
                className={`hud-pill ${activeRelFilter === "alliance" ? "active" : ""}`}
                style={{ "--pill-color": "#2ce6cc" } as React.CSSProperties}
                onClick={() => setActiveRelFilter(activeRelFilter === "alliance" ? null : "alliance")}
              >
                <span className="pill-dot" style={{ background: "#2ce6cc" }} />
                Love Interest
              </button>
              <button
                className={`hud-pill ${activeRelFilter === "family" ? "active" : ""}`}
                style={{ "--pill-color": "#e87fcc" } as React.CSSProperties}
                onClick={() => setActiveRelFilter(activeRelFilter === "family" ? null : "family")}
              >
                <span className="pill-dot" style={{ background: "#e87fcc" }} />
                Siblings
              </button>
              <button
                className={`hud-pill ${activeRelFilter === "parent" ? "active" : ""}`}
                style={{ "--pill-color": "#F5A623" } as React.CSSProperties}
                onClick={() => setActiveRelFilter(activeRelFilter === "parent" ? null : "parent")}
              >
                <span className="pill-dot" style={{ background: "#F5A623" }} />
                Parents
              </button>
              <button
                className={`hud-pill ${activeRelFilter === "marriage" ? "active" : ""}`}
                style={{ "--pill-color": "#FD79A8" } as React.CSSProperties}
                onClick={() => setActiveRelFilter(activeRelFilter === "marriage" ? null : "marriage")}
              >
                <span className="pill-dot" style={{ background: "#FD79A8" }} />
                Married
              </button>
              <button
                className={`hud-pill ${activeRelFilter === "conflict" ? "active" : ""}`}
                style={{ "--pill-color": "#ff5555" } as React.CSSProperties}
                onClick={() => setActiveRelFilter(activeRelFilter === "conflict" ? null : "conflict")}
              >
                <span className="pill-dot" style={{ background: "#ff5555" }} />
                Butterfly Effect
              </button>
            </div>

            {/* View Controls */}
            <div className="hud-tools">
              <button className="hud-tool-btn" onClick={() => setZoom((z) => Math.min(z + 0.15, 1.8))} title="Zoom In">
                <ZoomIn size={15} />
              </button>
              <button className="hud-tool-btn" onClick={() => setZoom((z) => Math.max(z - 0.15, 0.4))} title="Zoom Out">
                <ZoomOut size={15} />
              </button>
              <button className="hud-tool-btn" onClick={resetView} title="Reset View">
                <RefreshCw size={15} />
              </button>
            </div>
          </div>

          {/* Interactive Stage */}
          <div
            ref={containerRef}
            className={`tree-canvas ${isDragging ? "dragging" : ""}`}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            <div
              className="tree-stage"
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transformOrigin: "0 0",
                width: CANVAS_W,
                height: CANVAS_H,
              }}
            >
              <svg className="tree-svg-layer" style={{ width: CANVAS_W, height: CANVAS_H, overflow: "visible" }}>
                <defs>
                  {/* Dynamic Linear Link Gradients */}
                  {linkList.map((link) => {
                    const srcCol = link.sourceNode.character.color || "#f5d233";
                    const tgtCol = link.targetNode.character.color || "#2ce6cc";
                    return (
                      <linearGradient
                        key={`grad-${link.id}`}
                        id={`link-grad-${link.id}`}
                        x1={link.x1}
                        y1={link.y1}
                        x2={link.x2}
                        y2={link.y2}
                        gradientUnits="userSpaceOnUse"
                      >
                        <stop offset="0%" stopColor={srcCol} stopOpacity="0.9" />
                        <stop offset="100%" stopColor={tgtCol} stopOpacity="0.9" />
                      </linearGradient>
                    );
                  })}

                  {/* Arrowhead Markers */}
                  {Object.entries(REL_COLORS).map(([type, config]) => (
                    <marker
                      key={type}
                      id={`arr-${type}`}
                      viewBox="0 0 10 10"
                      refX="7"
                      refY="5"
                      markerWidth="7"
                      markerHeight="7"
                      orient="auto"
                    >
                      <path d="M 0 1.5 L 9 5 L 0 8.5 Z" fill={config.color} opacity="0.95" />
                    </marker>
                  ))}
                </defs>

                {/* ── LINKS LAYER ── */}
                {linkList.map((link) => {
                  const relType = (link.type || "").toLowerCase();
                  const relConfig = REL_COLORS[relType] || REL_COLORS.default;
                  const relColor = relConfig.color;

                  const isHighlighted = activeLinkIds.has(link.id);
                  const isFilteredOut = activeRelFilter && relType !== activeRelFilter;
                  const isDimmed = isFilteredOut || (hoveredCharId && !isHighlighted);

                  return (
                    <g key={link.id} style={{ opacity: isDimmed ? 0.1 : 1, transition: "opacity 0.25s" }}>
                      {/* Glow stroke when active */}
                      {isHighlighted && !isFilteredOut && (
                        <path
                          d={link.pathD}
                          fill="none"
                          stroke={relColor}
                          strokeWidth={6}
                          strokeOpacity={0.35}
                          style={{ filter: "blur(3px)" }}
                        />
                      )}

                      <path
                        d={link.pathD}
                        fill="none"
                        stroke={`url(#link-grad-${link.id})`}
                        strokeWidth={isHighlighted ? 2.5 : 1.8}
                        strokeDasharray={relType === "conflict" ? "6,4" : undefined}
                        markerEnd={`url(#arr-${relType in REL_COLORS ? relType : "default"})`}
                        style={{ pointerEvents: "none" }}
                      />

                      {/* Relationship Midpoint Pill Label — shown when link is highlighted or filtered */}
                      {(isHighlighted || (activeRelFilter && relType === activeRelFilter)) && (
                        <g
                          transform={`translate(${link.midX}, ${link.midY})`}
                          style={{ cursor: "pointer" }}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedChar(link.targetNode.character);
                          }}
                        >
                          <rect
                            x={-link.label.length * 3.6 - 10}
                            y={-11}
                            width={link.label.length * 7.2 + 20}
                            height={22}
                            rx={11}
                            fill="rgba(12, 10, 26, 0.94)"
                            stroke={relColor}
                            strokeWidth={1}
                            strokeOpacity={isHighlighted ? 0.9 : 0.45}
                          />
                          <text
                            fill={relColor}
                            fontSize="10"
                            fontWeight="700"
                            fontFamily="var(--font-ui)"
                            textAnchor="middle"
                            dy="0.35em"
                          >
                            {link.label}
                          </text>
                        </g>
                      )}
                    </g>
                  );
                })}

                {/* ── SIGMA CLEAN CIRCLE NODES ── */}
                {nodePosList.map((pos) => {
                  const char = pos.character;
                  const isHovered = hoveredCharId === char.id;
                  const isConnected = activeCharIds.has(char.id);
                  const isSelected = selectedChar?.id === char.id;

                  const isSearchMatch = searchHighlightIds.length === 0 || searchHighlightIds.includes(char.id);
                  const isDimmed = (hoveredCharId && !isConnected) || !isSearchMatch;

                  const charChapters = chapters.filter((ch) => Array.isArray(ch.characters) && ch.characters.includes(char.id));
                  const initials = CHARACTER_INITIALS[char.id] || char.name.slice(0, 2).toUpperCase();

                  // Smart label positioning outwards along radius
                  let labelAnchor: "middle" | "start" | "end" = "middle";
                  let labelDx = 0;
                  let labelDy = pos.r + 18;

                  if (!pos.isHero) {
                    const cos = Math.cos(pos.angle);
                    const sin = Math.sin(pos.angle);

                    labelDx = cos * (pos.r + 14);
                    labelDy = sin * (pos.r + 14);

                    if (cos > 0.3) labelAnchor = "start";
                    else if (cos < -0.3) labelAnchor = "end";
                    else labelAnchor = "middle";
                  }

                  return (
                    <g
                      key={char.id}
                      className={`sigma-node-group ${pos.isHero ? "hero-node" : ""} ${isHovered ? "hovered" : ""} ${isSelected ? "selected" : ""}`}
                      style={{
                        cursor: "pointer",
                        opacity: isDimmed ? 0.2 : 1,
                        transition: "opacity 0.25s, transform 0.25s",
                      }}
                      onMouseEnter={() => setHoveredCharId(char.id)}
                      onMouseLeave={() => setHoveredCharId(null)}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedChar(char);
                      }}
                      onTouchEnd={(e) => {
                        e.stopPropagation();
                        setSelectedChar(char);
                      }}
                    >
                      {/* Invisible expanded touch hit target */}
                      <circle cx={pos.cx} cy={pos.cy} r={pos.r + 20} fill="transparent" style={{ cursor: "pointer" }} />
                      {/* Outer Glow Ring on Hover or Selection */}
                      {(isHovered || isSelected || pos.isHero) && (
                        <circle
                          cx={pos.cx}
                          cy={pos.cy}
                          r={pos.r + 9}
                          fill="none"
                          stroke={pos.isHero ? "#f5d233" : char.color}
                          strokeWidth={2.5}
                          strokeOpacity={isHovered || isSelected ? 0.8 : 0.4}
                          style={{ filter: "blur(4px)" }}
                        />
                      )}

                      {/* Main Filled Circle Node */}
                      <circle
                        cx={pos.cx}
                        cy={pos.cy}
                        r={pos.r}
                        fill={pos.isHero ? "#f5d233" : char.color}
                        stroke="#ffffff"
                        strokeWidth={2}
                      />

                      {/* Initials Inside Circle */}
                      <text
                        x={pos.cx}
                        y={pos.cy}
                        textAnchor="middle"
                        dy="0.35em"
                        fill={pos.isHero ? "#000000" : "#ffffff"}
                        fontSize={pos.isHero ? "17" : "13"}
                        fontWeight="800"
                        fontFamily="var(--font-heading)"
                      >
                        {initials}
                      </text>

                      {/* Clean Text Label Outside Circle */}
                      <g transform={`translate(${pos.cx + labelDx}, ${pos.cy + labelDy})`}>
                        <text
                          textAnchor={labelAnchor}
                          fill={isSelected || isHovered ? "#ffffff" : "rgba(255, 255, 255, 0.9)"}
                          fontSize={pos.isHero ? "14" : "12"}
                          fontWeight="700"
                          fontFamily="var(--font-heading)"
                        >
                          {char.name}
                          {pos.isHero && <tspan fill="#f5d233"> ★</tspan>}
                        </text>
                        <text
                          dy="1.3em"
                          textAnchor={labelAnchor}
                          fill={char.color}
                          fontSize="10"
                          fontWeight="600"
                          fontFamily="var(--font-ui)"
                        >
                          {charChapters.length} {charChapters.length === 1 ? "STORY" : "STORIES"}
                          {char.role ? ` · ${char.role}` : ""}
                        </text>
                      </g>
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>

          {/* Bottom Compass Helper */}
          <div className="sigma-bottom-bar">
            <Compass size={13} className="hud-icon" />
            <span>Click any character node to inspect stories & relationships in the panel on the right</span>
          </div>
        </div>

        {/* RIGHT SIDE: NETWORK ANALYSIS & STORY FINDER PANEL (Matching Sigma.js screenshot!) */}
        <div className="sigma-side-panel">
          <div className="side-panel-header">
            <div className="side-panel-title">
              <Layers size={16} className="hud-icon" />
              <span>Network Analysis & Stories</span>
            </div>
            <span className="side-panel-badge">LIVE METRICS</span>
          </div>

          {/* Global Network Metrics */}
          <div className="metrics-grid">
            <div className="metric-card">
              <div className="metric-val">{characters.length}</div>
              <div className="metric-lbl">CHARACTERS</div>
            </div>
            <div className="metric-card">
              <div className="metric-val">{linkList.length}</div>
              <div className="metric-lbl">CONNECTIONS</div>
            </div>
            <div className="metric-card">
              <div className="metric-val">{chapters.length}</div>
              <div className="metric-lbl">TOTAL STORIES</div>
            </div>
          </div>

          {/* Selected Character Inspector Card */}
          {activeCharObj ? (
            <div className="selected-char-card" style={{ borderLeftColor: activeCharObj.color }}>
              <div className="char-card-header">
                <div
                  className="char-avatar-circle"
                  style={{
                    background: activeCharObj.color,
                    color: activeCharObj.id === "amudhan" ? "#000" : "#fff",
                  }}
                >
                  {CHARACTER_INITIALS[activeCharObj.id] || activeCharObj.name.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <div className="char-card-name" style={{ color: activeCharObj.color }}>
                    {activeCharObj.name}
                    {activeCharObj.id === "amudhan" && <Sparkles size={14} className="hero-sparkle" />}
                  </div>
                  {activeCharObj.role && <div className="char-card-role">{activeCharObj.role}</div>}
                </div>
              </div>

              <div className="char-card-desc">{activeCharObj.description}</div>

              {/* Connected Relationships List */}
              <div className="char-sec-label">
                CONNECTIONS ({activeCharRels.length})
              </div>
              <div className="char-rels-list">
                {activeCharRels.map((rel) => {
                  const otherId = rel.source === activeCharObj.id ? rel.target : rel.source;
                  const otherChar = characters.find((c) => c.id === otherId);
                  const relType = (rel.type || "").toLowerCase();
                  const relConfig = REL_COLORS[relType] || REL_COLORS.default;

                  if (!otherChar) return null;

                  return (
                    <div
                      key={rel.id}
                      className="rel-item-pill"
                      onClick={() => setSelectedChar(otherChar)}
                      title={rel.description || `${otherChar.name} (${rel.label})`}
                    >
                      <span className="rel-dot" style={{ background: relConfig.color }} />
                      <span className="rel-target-name">{otherChar.name}</span>
                      <span className="rel-type-tag" style={{ color: relConfig.color }}>
                        {rel.label}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Story Finder: Chapter List with Direct Click Readers */}
              <div className="char-sec-label">
                FEATURED STORIES & CHAPTERS ({activeCharChapters.length})
              </div>
              <div className="char-chapters-list">
                {activeCharChapters.map((ch) => (
                  <div
                    key={ch.id}
                    className="chapter-tag-card"
                    onClick={() => onTagClick(ch.id)}
                  >
                    <div className="chap-info">
                      <div className="chap-title-tamil">{ch.title}</div>
                      <div className="chap-title-en">{ch.titleEn}</div>
                    </div>
                    <div className="read-action-btn">
                      <span>READ</span>
                      <BookOpen size={13} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="empty-panel-prompt">
              <Compass size={24} className="empty-icon" />
              <div>Click any character node on the network graph to inspect stories and relationships.</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

