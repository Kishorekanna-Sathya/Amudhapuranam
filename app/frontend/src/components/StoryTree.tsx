import { useState, useMemo, useRef, useEffect } from "react";
import type { Chapter, Character } from "../data/jsonLoader";
import { ZoomIn, ZoomOut, RefreshCw, GitFork, BookOpen } from "lucide-react";

interface Props {
  chapters: Chapter[];
  characters: Character[];
  onSelectChapter: (chapter: Chapter) => void;
}

interface NodePosition {
  chapter: Chapter;
  level: number;
  x: number;
  y: number;
  parents: string[];
  children: string[];
}

export default function StoryTree({ chapters, characters, onSelectChapter }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(0.9);
  const [pan, setPan] = useState({ x: 20, y: 30 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  // Touch tracking for mobile
  const touchStartRef = useRef<{ x: number; y: number; dist?: number }>({ x: 0, y: 0 });

  const NODE_WIDTH = 270;
  const NODE_HEIGHT = 155;
  const LEVEL_GAP = 100; // Vertical distance between generations (levels)
  const COL_GAP = 36;    // Horizontal distance between sibling nodes in same generation

  // Compute vertical multi-parent DAG hierarchy layout
  const { nodes, links, canvasWidth, canvasHeight } = useMemo(() => {
    if (!chapters || chapters.length === 0) {
      return { nodes: [], links: [], canvasWidth: 1200, canvasHeight: 1200 };
    }

    const chapterMap = new Map<string, Chapter>();
    chapters.forEach((ch) => chapterMap.set(ch.id, ch));

    // Calculate level (depth) for each node using memoized recursion
    const levelMap = new Map<string, number>();
    const visiting = new Set<string>();

    function getLevel(id: string): number {
      if (levelMap.has(id)) return levelMap.get(id)!;
      if (visiting.has(id)) return 0; // break cycle if any

      visiting.add(id);
      const ch = chapterMap.get(id);
      const parents = (ch?.parent_story || []).filter((pid) => chapterMap.has(pid));

      let lvl = 0;
      if (parents.length > 0) {
        lvl = 1 + Math.max(...parents.map((pid) => getLevel(pid)));
      }

      visiting.delete(id);
      levelMap.set(id, lvl);
      return lvl;
    }

    chapters.forEach((ch) => getLevel(ch.id));

    // Group nodes by level
    const levels: Chapter[][] = [];
    chapters.forEach((ch) => {
      const lvl = levelMap.get(ch.id) || 0;
      while (levels.length <= lvl) levels.push([]);
      levels[lvl].push(ch);
    });

    // Build children relationships
    const childrenMap = new Map<string, string[]>();
    chapters.forEach((ch) => {
      const parents = (ch.parent_story || []).filter((pid) => chapterMap.has(pid));
      parents.forEach((pid) => {
        if (!childrenMap.has(pid)) childrenMap.set(pid, []);
        childrenMap.get(pid)!.push(ch.id);
      });
    });

    // Calculate max level width to size the canvas & center each generation
    const levelWidths = levels.map(
      (lvl) => lvl.length * NODE_WIDTH + Math.max(0, lvl.length - 1) * COL_GAP
    );
    const maxLevelWidth = Math.max(...levelWidths, 800);
    const totalCanvasWidth = maxLevelWidth + 160;
    const totalCanvasHeight = levels.length * (NODE_HEIGHT + LEVEL_GAP) + 200;

    // Calculate (X, Y) layout positions for each node (Vertical: Level = Y, Column = X)
    const nodePositions: NodePosition[] = [];
    const nodePosMap = new Map<string, NodePosition>();

    levels.forEach((lvlChapters, lvlIndex) => {
      const y = 40 + lvlIndex * (NODE_HEIGHT + LEVEL_GAP);
      const lvlWidth = levelWidths[lvlIndex];
      const startX = (totalCanvasWidth - lvlWidth) / 2;

      lvlChapters.forEach((ch, colIndex) => {
        const x = startX + colIndex * (NODE_WIDTH + COL_GAP);
        const parents = (ch.parent_story || []).filter((pid) => chapterMap.has(pid));
        const children = childrenMap.get(ch.id) || [];

        const pos: NodePosition = {
          chapter: ch,
          level: lvlIndex,
          x,
          y,
          parents,
          children,
        };

        nodePositions.push(pos);
        nodePosMap.set(ch.id, pos);
      });
    });

    // Build vertical connection links (Bottom of parent -> Top of child)
    const linkList: Array<{
      id: string;
      sourceId: string;
      targetId: string;
      x1: number;
      y1: number;
      x2: number;
      y2: number;
    }> = [];

    nodePositions.forEach((targetPos) => {
      targetPos.parents.forEach((parentId) => {
        const sourcePos = nodePosMap.get(parentId);
        if (sourcePos) {
          linkList.push({
            id: `${parentId}->${targetPos.chapter.id}`,
            sourceId: parentId,
            targetId: targetPos.chapter.id,
            x1: sourcePos.x + NODE_WIDTH / 2,
            y1: sourcePos.y + NODE_HEIGHT,
            x2: targetPos.x + NODE_WIDTH / 2,
            y2: targetPos.y,
          });
        }
      });
    });

    return {
      nodes: nodePositions,
      links: linkList,
      canvasWidth: totalCanvasWidth,
      canvasHeight: totalCanvasHeight,
    };
  }, [chapters]);

  // Center view on mount / resize
  useEffect(() => {
    if (containerRef.current) {
      const containerW = containerRef.current.clientWidth;
      const initialPanX = Math.max(16, (containerW - canvasWidth * zoom) / 2);
      setPan({ x: initialPanX, y: 30 });
    }
  }, [canvasWidth]);

  // Mouse pan handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest(".tree-node-card")) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  };

  const handleMouseUp = () => setIsDragging(false);

  // Touch pan & pinch zoom handlers for mobile devices
  const handleTouchStart = (e: React.TouchEvent) => {
    if ((e.target as HTMLElement).closest(".tree-node-card")) return;
    if (e.touches.length === 1) {
      touchStartRef.current = {
        x: e.touches[0].clientX - pan.x,
        y: e.touches[0].clientY - pan.y,
      };
      setIsDragging(true);
    } else if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      touchStartRef.current = { x: pan.x, y: pan.y, dist };
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 1 && isDragging) {
      setPan({
        x: e.touches[0].clientX - touchStartRef.current.x,
        y: e.touches[0].clientY - touchStartRef.current.y,
      });
    } else if (e.touches.length === 2 && touchStartRef.current.dist) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.hypot(dx, dy);
      const factor = dist / touchStartRef.current.dist;
      setZoom((z) => Math.max(0.3, Math.min(1.8, z * factor)));
      touchStartRef.current.dist = dist;
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
  };

  const resetView = () => {
    const containerW = containerRef.current?.clientWidth || 800;
    const initialPanX = Math.max(16, (containerW - canvasWidth * 0.9) / 2);
    setZoom(0.9);
    setPan({ x: initialPanX, y: 30 });
  };

  // Determine highlighted links/nodes on hover
  const activeLinkIds = useMemo(() => {
    if (!hoveredNodeId) return new Set<string>();
    const set = new Set<string>();
    links.forEach((l) => {
      if (l.sourceId === hoveredNodeId || l.targetId === hoveredNodeId) {
        set.add(l.id);
      }
    });
    return set;
  }, [hoveredNodeId, links]);

  const activeNodeIds = useMemo(() => {
    if (!hoveredNodeId) return new Set<string>();
    const set = new Set<string>([hoveredNodeId]);
    links.forEach((l) => {
      if (l.sourceId === hoveredNodeId) set.add(l.targetId);
      if (l.targetId === hoveredNodeId) set.add(l.sourceId);
    });
    return set;
  }, [hoveredNodeId, links]);

  return (
    <div className="story-tree-wrapper">
      {/* Top Header / Legend */}
      <div className="tree-toolbar">
        <div className="tree-info">
          <div className="tree-title">
            <GitFork size={18} className="tree-title-icon" />
            <span>STORY HIERARCHY TREE</span>
          </div>
          <div className="tree-subtitle">
            Vertical dependency flow · Tap or click node to read story
          </div>
        </div>

        {/* Zoom & View Controls */}
        <div className="tree-controls">
          <button className="tree-btn" onClick={() => setZoom((z) => Math.min(z + 0.15, 1.8))} title="Zoom In" aria-label="Zoom In">
            <ZoomIn size={16} />
          </button>
          <button className="tree-btn" onClick={() => setZoom((z) => Math.max(z - 0.15, 0.35))} title="Zoom Out" aria-label="Zoom Out">
            <ZoomOut size={16} />
          </button>
          <button className="tree-btn" onClick={resetView} title="Reset View" aria-label="Reset View">
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {/* Main Interactive Canvas Area */}
      <div
        ref={containerRef}
        className={`tree-canvas ${isDragging ? "dragging" : ""}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div
          className="tree-stage"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "0 0",
          }}
        >
          {/* SVG Links Layer */}
          <svg className="tree-svg-layer" style={{ width: canvasWidth, height: canvasHeight }}>
            <defs>
              <linearGradient id="link-grad-default" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.4" />
                <stop offset="100%" stopColor="var(--border-strong)" stopOpacity="0.5" />
              </linearGradient>
              <linearGradient id="link-grad-active" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="var(--accent)" stopOpacity="1" />
                <stop offset="100%" stopColor="var(--accent-hover)" stopOpacity="1" />
              </linearGradient>

              {/* Downward Arrowhead markers */}
              <marker
                id="arrow-default"
                viewBox="0 0 10 10"
                refX="5"
                refY="8"
                markerWidth="6"
                markerHeight="6"
                orient="auto"
              >
                <path d="M 1 1 L 5 8 L 9 1 z" fill="var(--border-strong)" />
              </marker>
              <marker
                id="arrow-active"
                viewBox="0 0 10 10"
                refX="5"
                refY="8"
                markerWidth="7"
                markerHeight="7"
                orient="auto"
              >
                <path d="M 1 1 L 5 8 L 9 1 z" fill="var(--accent)" />
              </marker>
            </defs>

            {links.map((link) => {
              const isActive = activeLinkIds.has(link.id);
              const dy = link.y2 - link.y1;
              const ctrl1Y = link.y1 + Math.max(dy * 0.4, 25);
              const ctrl2Y = link.y2 - Math.max(dy * 0.4, 25);
              const pathD = `M ${link.x1} ${link.y1} C ${link.x1} ${ctrl1Y}, ${link.x2} ${ctrl2Y}, ${link.x2} ${link.y2}`;

              return (
                <g key={link.id}>
                  {/* Outer glow stroke for active links */}
                  {isActive && (
                    <path
                      d={pathD}
                      fill="none"
                      stroke="var(--accent)"
                      strokeWidth={5}
                      strokeOpacity={0.25}
                      style={{ filter: "blur(3px)" }}
                    />
                  )}
                  <path
                    d={pathD}
                    fill="none"
                    stroke={isActive ? "url(#link-grad-active)" : "url(#link-grad-default)"}
                    strokeWidth={isActive ? 3.2 : 2}
                    markerEnd={isActive ? "url(#arrow-active)" : "url(#arrow-default)"}
                    className={`tree-link-path ${isActive ? "active" : ""}`}
                  />
                </g>
              );
            })}
          </svg>

          {/* HTML Nodes Layer */}
          <div className="tree-nodes-layer">
            {nodes.map((node) => {
              const ch = node.chapter;
              const isHovered = hoveredNodeId === ch.id;
              const isConnected = activeNodeIds.has(ch.id);

              const charList = ch.characters
                .map((cid) => characters.find((c) => c.id === cid))
                .filter(Boolean) as Character[];

              return (
                <div
                  key={ch.id}
                  className={`tree-node-card ${isHovered ? "hovered" : ""} ${isConnected ? "connected" : ""}`}
                  style={{
                    left: `${node.x}px`,
                    top: `${node.y}px`,
                    width: `${NODE_WIDTH}px`,
                    height: `${NODE_HEIGHT}px`,
                  }}
                  onMouseEnter={() => setHoveredNodeId(ch.id)}
                  onMouseLeave={() => setHoveredNodeId(null)}
                  onClick={() => onSelectChapter(ch)}
                >
                  <div className="node-card-inner">
                    <div className="node-header">
                      <span className="node-gen-badge">
                        {node.level === 0 ? "★ ROOT STORY" : `GEN ${node.level}`}
                      </span>
                      {ch.location && <span className="node-location">{ch.location}</span>}
                    </div>

                    <div className="node-title-tamil">{ch.title}</div>
                    <div className="node-title-en">{ch.titleEn}</div>

                    <div className="node-footer">
                      <div className="node-chars">
                        {charList.slice(0, 3).map((c) => (
                          <span
                            key={c.id}
                            className="node-char-pill"
                            style={{
                              background: c.color + "1A",
                              borderColor: c.color + "55",
                              color: "var(--text-primary)",
                            }}
                          >
                            <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: c.color, marginRight: 4 }} />
                            {c.name}
                          </span>
                        ))}
                        {charList.length > 3 && (
                          <span className="node-char-more">+{charList.length - 3}</span>
                        )}
                      </div>

                      <div className="node-action">
                        <BookOpen size={14} />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
