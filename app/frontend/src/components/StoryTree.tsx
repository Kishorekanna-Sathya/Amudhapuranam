import { useState, useMemo, useRef, useEffect } from "react";
import type { Chapter, Character } from "../data/jsonLoader";
import { ZoomIn, ZoomOut, RefreshCw, GitFork, BookOpen, ChevronRight, X, ExternalLink } from "lucide-react";

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
  const [zoom, setZoom] = useState(0.85);
  const [pan, setPan] = useState({ x: 20, y: 30 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const touchStartRef = useRef<{ x: number; y: number; dist?: number }>({ x: 0, y: 0 });
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Responsive mobile state
  const [isMobile, setIsMobile] = useState<boolean>(
    () => typeof window !== "undefined" && window.innerWidth < 860
  );

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 860);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Responsive Node & Layout dimensions
  const NODE_WIDTH = isMobile ? 120 : 270;
  const NODE_HEIGHT = isMobile ? 70 : 155;
  const LEVEL_GAP = isMobile ? 70 : 100;
  const COL_GAP = isMobile ? 20 : 36;

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
    const maxLevelWidth = Math.max(...levelWidths, isMobile ? 300 : 800);
    const totalCanvasWidth = maxLevelWidth + (isMobile ? 40 : 160);
    const totalCanvasHeight = levels.length * (NODE_HEIGHT + LEVEL_GAP) + (isMobile ? 60 : 200);

    // Calculate (X, Y) layout positions for each node (Vertical: Level = Y, Column = X)
    const nodePositions: NodePosition[] = [];
    const nodePosMap = new Map<string, NodePosition>();

    levels.forEach((lvlChapters, lvlIndex) => {
      const y = (isMobile ? 24 : 40) + lvlIndex * (NODE_HEIGHT + LEVEL_GAP);
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
  }, [chapters, isMobile, NODE_WIDTH, NODE_HEIGHT, LEVEL_GAP, COL_GAP]);

  // Center view on mount / resize / mobile toggle / tab change
  const centerTree = () => {
    if (!containerRef.current) return;
    const containerW = containerRef.current.clientWidth || (typeof window !== "undefined" ? window.innerWidth : 390);
    if (containerW <= 0) return;
    const calcZoom = isMobile
      ? Math.min(1.0, Math.max(0.6, (containerW - 24) / canvasWidth))
      : 0.85;
    setZoom(calcZoom);
    const initialPanX = (containerW - canvasWidth * calcZoom) / 2;
    // On mobile, toolbar is ~56px — offset pan.y so first row of nodes is visible below it
    const topOffset = isMobile ? 70 : 30;
    setPan({ x: Math.round(initialPanX), y: topOffset });
  };

  useEffect(() => {
    centerTree();
    if (!containerRef.current) return;
    const observer = new ResizeObserver(() => {
      centerTree();
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [canvasWidth, isMobile]);

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
    centerTree();
  };

  // Determine active node for highlights
  const activeId = hoveredNodeId || selectedNodeId;

  const activeLinkIds = useMemo(() => {
    if (!activeId) return new Set<string>();
    const set = new Set<string>();
    links.forEach((l) => {
      if (l.sourceId === activeId || l.targetId === activeId) {
        set.add(l.id);
      }
    });
    return set;
  }, [activeId, links]);

  const activeNodeIds = useMemo(() => {
    if (!activeId) return new Set<string>();
    const set = new Set<string>([activeId]);
    links.forEach((l) => {
      if (l.sourceId === activeId) set.add(l.targetId);
      if (l.targetId === activeId) set.add(l.sourceId);
    });
    return set;
  }, [activeId, links]);

  const selectedNode = useMemo(() => {
    if (!selectedNodeId) return null;
    return nodes.find((n) => n.chapter.id === selectedNodeId) || null;
  }, [selectedNodeId, nodes]);

  const selectedNodeChars = useMemo(() => {
    if (!selectedNode) return [];
    return (selectedNode.chapter.characters || [])
      .map((cid) => characters.find((c) => c.id === cid))
      .filter(Boolean) as Character[];
  }, [selectedNode, characters]);

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
            {isMobile ? "Tap node to inspect story & characters" : "Vertical dependency flow · Tap or click node to read story"}
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
              const isSelected = selectedNodeId === ch.id;
              const isHovered = hoveredNodeId === ch.id;
              const isConnected = activeNodeIds.has(ch.id);

              const charList = ch.characters
                .map((cid) => characters.find((c) => c.id === cid))
                .filter(Boolean) as Character[];

              return (
                <div
                  key={ch.id}
                  className={`tree-node-card ${isMobile ? "mobile-node" : ""} ${isHovered ? "hovered" : ""} ${isSelected ? "selected" : ""} ${isConnected ? "connected" : ""}`}
                  style={{
                    left: `${node.x}px`,
                    top: `${node.y}px`,
                    width: `${NODE_WIDTH}px`,
                    height: `${NODE_HEIGHT}px`,
                  }}
                  onMouseEnter={() => setHoveredNodeId(ch.id)}
                  onMouseLeave={() => setHoveredNodeId(null)}
                  onClick={() => {
                    setSelectedNodeId(ch.id);
                    if (!isMobile) onSelectChapter(ch);
                  }}
                >
                  {isMobile ? (
                    <div className="st-mobile-node-inner">
                      <div className="st-mn-top">
                        <span className="st-mn-badge">
                          {node.level === 0 ? "ROOT" : `G${node.level}`}
                        </span>
                        {/* Anchor read icon button right on node */}
                        <button
                          className="st-mn-anchor-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectChapter(ch);
                          }}
                          title="Read Story"
                        >
                          <BookOpen size={11} />
                        </button>
                      </div>
                      <div className="st-mn-title">{ch.title}</div>
                    </div>
                  ) : (
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

                        <div className="node-action" onClick={(e) => { e.stopPropagation(); onSelectChapter(ch); }}>
                          <BookOpen size={14} />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Mobile Inspector Drawer Sheet when node is selected */}
      {isMobile && selectedNode && (
        <div className="st-mobile-inspector-sheet">
          <div className="st-sms-drag" />
          <div className="st-sms-header">
            <div className="st-sms-badge">
              {selectedNode.level === 0 ? "★ ROOT STORY" : `GEN ${selectedNode.level}`}
            </div>
            {selectedNode.chapter.location && (
              <div className="st-sms-location">{selectedNode.chapter.location}</div>
            )}
            <button className="st-sms-close" onClick={() => setSelectedNodeId(null)} aria-label="Close inspector">
              <X size={16} />
            </button>
          </div>

          <div className="st-sms-title-tamil">{selectedNode.chapter.title}</div>
          <div className="st-sms-title-en">{selectedNode.chapter.titleEn}</div>

          {selectedNodeChars.length > 0 && (
            <>
              <div className="st-sms-sec-label">FEATURED CHARACTERS</div>
              <div className="st-sms-chars">
                {selectedNodeChars.map((c) => (
                  <span key={c.id} className="st-sms-char-pill" style={{ borderColor: c.color, color: "var(--text-primary)" }}>
                    <span className="st-sms-char-dot" style={{ background: c.color }} />
                    {c.name}
                  </span>
                ))}
              </div>
            </>
          )}

          <button
            className="st-sms-read-btn"
            onClick={() => onSelectChapter(selectedNode.chapter)}
          >
            <BookOpen size={16} />
            <span>READ STORY</span>
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
