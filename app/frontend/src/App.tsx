import { useEffect, useState, useRef, useCallback } from "react";
import Fuse from "fuse.js";
import { loadStoryData, type Character, type Chapter, type StoryData } from "./data/yamlLoader";
import ForceGraph from "./components/ForceGraph";

type View = "graph" | "timeline" | "intro" | "index";

export default function App() {
  const [data, setData] = useState<StoryData | null>(null);
  const [loading, setLoading] = useState(true);

  const [view, setView] = useState<View>("intro");

  // Modal
  const [activeChapter, setActiveChapter] = useState<Chapter | null>(null);
  const [fontSize, setFontSize] = useState<"sm" | "md" | "lg">(() => {
    return (localStorage.getItem("ap-font-size") as "sm" | "md" | "lg") ?? "md";
  });

  const cycleFontSize = (dir: 1 | -1) => {
    const steps: Array<"sm" | "md" | "lg"> = ["sm", "md", "lg"];
    const idx = steps.indexOf(fontSize);
    const next = steps[Math.max(0, Math.min(steps.length - 1, idx + dir))];
    setFontSize(next);
    localStorage.setItem("ap-font-size", next);
  };

  const fontSizePx: Record<"sm" | "md" | "lg", string> = {
    sm: "15px",
    md: "19px",
    lg: "23px",
  };

  // Reading progress
  const [scrollPct, setScrollPct] = useState(0);
  const handleModalScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const pct = el.scrollHeight <= el.clientHeight
      ? 100
      : Math.round((el.scrollTop / (el.scrollHeight - el.clientHeight)) * 100);
    setScrollPct(pct);
  };

  // Search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{ characters: any[]; chapters: any[] }>({ characters: [], chapters: [] });
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchHighlightIds, setSearchHighlightIds] = useState<string[]>([]);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const mobileSearchInputRef = useRef<HTMLInputElement>(null);

  const fuseRef = useRef<Fuse<any>>(null!);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchWrapRef = useRef<HTMLDivElement>(null);

  // ── Load YAML ────────────────────────────────────────
  useEffect(() => {
    loadStoryData()
      .then((d) => { setData(d); buildFuse(d); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  function buildFuse(d: StoryData) {
    const items = [
      ...d.characters.map((c) => ({ type: "character", id: c.id, name: c.name, text: [c.description, c.role].join(" ") })),
      ...d.chapters.map((ch) => ({ type: "chapter", id: ch.id, name: ch.title + " — " + ch.titleEn, text: ch.content + " " + ch.location })),
    ];
    fuseRef.current = new Fuse(items, { keys: [{ name: "name", weight: 0.6 }, { name: "text", weight: 0.4 }], threshold: 0.4, includeScore: true });
  }

  // ── Search ────────────────────────────────────────────
  const handleSearch = useCallback((q: string) => {
    setSearchQuery(q);
    if (!q.trim() || !fuseRef.current) {
      setSearchResults({ characters: [], chapters: [] });
      setSearchOpen(false);
      setSearchHighlightIds([]);
      return;
    }
    const hits = fuseRef.current.search(q).slice(0, 10);
    const chars = hits.filter((h) => h.item.type === "character").map((h) => h.item);
    const chaps = hits.filter((h) => h.item.type === "chapter").map((h) => h.item);
    setSearchResults({ characters: chars, chapters: chaps });
    setSearchOpen(hits.length > 0);
    const charIds = new Set<string>(chars.map((c: any) => c.id));
    chaps.forEach((ch: any) => {
      const chapter = data?.chapters.find((c) => c.id === ch.id);
      chapter?.characters.forEach((cid) => charIds.add(cid));
    });
    setSearchHighlightIds(Array.from(charIds));
  }, [data]);

  const clearSearch = () => {
    setSearchQuery(""); setSearchResults({ characters: [], chapters: [] });
    setSearchOpen(false); setSearchHighlightIds([]);
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!searchWrapRef.current?.contains(e.target as Node)) setSearchOpen(false);
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, []);

  // ── Keyboard shortcuts ────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const inInput = (e.target as HTMLElement).matches("input, textarea, select");
      if (e.key === "Escape") { setActiveChapter(null); clearSearch(); }
      if (!inInput) {
        if (e.key === "g") setView("graph");
        if (e.key === "t") setView("timeline");
        if (e.key === "s") setView("index");
      }
      if (e.key === "/" && !inInput) { e.preventDefault(); searchInputRef.current?.focus(); }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  // ── Search hit ────────────────────────────────────────
  const handleSearchHit = (type: string, id: string) => {
    clearSearch();
    if (type === "chapter") {
      const ch = data?.chapters.find((c) => c.id === id);
      if (ch) setActiveChapter(ch);
    } else {
      setView("graph");
    }
  };

  // ── Loading ───────────────────────────────────────────
  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-logo">AMUDHAPURANAM</div>
        <div className="loading-text">Loading story…</div>
        <div className="loading-bar"><div className="loading-fill" /></div>
      </div>
    );
  }
  if (!data) return <div className="loading-screen">Failed to load story data.</div>;

  const sortedChapters = [...data.chapters].sort((a, b) => a.timeline - b.timeline);
  // TOC index — sort by chapterOrder, fall back to timeline if not set
  const indexChapters = [...data.chapters].sort((a, b) =>
    (a.chapterOrder ?? a.timeline) - (b.chapterOrder ?? b.timeline)
  );

  return (
    <div className="app-shell">
      {/* ── HEADER ── */}
      <header className="header">
        <div className="logo">
          <div className="logo-badge">அ</div>
          <div className="logo-stack">
            <span className="logo-en-kicker">AMUDHAPURANAM</span>
            <span className="logo-tamil">அமுதபுராணம்</span>
            <span className="logo-tagline">Neighbourhood Amudhan</span>
          </div>
        </div>
        <div className="logo-sep" />

        <div className="search-wrap" ref={searchWrapRef}>
          <span className="search-icon">⌕</span>
          <input
            id="search-input" ref={searchInputRef} className="search-input" type="text"
            placeholder="Search characters, chapters, locations…"
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            onFocus={() => searchQuery && setSearchOpen(true)}
          />
          <div id="search-results" className={`search-results ${searchOpen ? "open" : ""}`}>
            {searchResults.characters.length === 0 && searchResults.chapters.length === 0 && (
              <div className="sr-empty">No results found</div>
            )}
            {searchResults.characters.length > 0 && <>
              <div className="sr-group-label">CHARACTERS</div>
              {searchResults.characters.map((c: any) => (
                <div key={c.id} className="sr-item" onClick={() => handleSearchHit("character", c.id)}>
                  <span className="sr-badge character">character</span>
                  <span className="sr-name">{c.name}</span>
                </div>
              ))}
            </>}
            {searchResults.chapters.length > 0 && <>
              <div className="sr-group-label">CHAPTERS</div>
              {searchResults.chapters.map((ch: any) => (
                <div key={ch.id} className="sr-item" onClick={() => handleSearchHit("chapter", ch.id)}>
                  <span className="sr-badge chapter">chapter</span>
                  <span className="sr-name">{ch.name}</span>
                </div>
              ))}
            </>}
          </div>
        </div>

        <div className="view-controls">
          <button id="btn-intro" className={`btn ${view === "intro" ? "active" : ""}`} onClick={() => setView("intro")}>📖 INTRO</button>
          <button id="btn-index" className={`btn ${view === "index" ? "active" : ""}`} onClick={() => setView("index")}>≡ STORIES</button>
          <button id="btn-graph" className={`btn ${view === "graph" ? "active" : ""}`} onClick={() => setView("graph")}>⬡ GRAPH</button>
          <button id="btn-timeline" className={`btn ${view === "timeline" ? "active" : ""}`} onClick={() => setView("timeline")}>◈ TIMELINE</button>
          <a
            id="btn-insta"
            className="btn insta-btn"
            href="https://www.instagram.com/the.goated.ink/"
            target="_blank"
            rel="noopener noreferrer"
            title="Author on Instagram"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
              <circle cx="12" cy="12" r="4"/>
              <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/>
            </svg>
            AUTHOR
          </a>
        </div>
      </header>

      {/* ── MAIN ── */}
      <main className="main-area">

        {/* ══ INTRO VIEW ══ */}
        <div className="intro-view" style={{ display: view === "intro" ? "flex" : "none" }}>

          {/* Photo — left column on desktop, background canvas on mobile (hidden by CSS on mobile) */}
          <div className="intro-photo-panel">
            <img
              src={`${import.meta.env.BASE_URL}author.png`}
              alt="Author — Amudhan"
              className="intro-photo-img"
            />
            <div className="intro-photo-overlay" />
            <div className="intro-photo-fade" />
          </div>

          {/* ── DESKTOP: editorial right panel ── */}
          <div className="intro-content-panel">
            <button className="intro-close" onClick={() => setView("index")} title="Close">×</button>
            <div className="intro-watermark" aria-hidden="true">அ</div>
            <div className="intro-top-rule" />
            <div className="intro-content-inner">
              <div className="intro-eyebrow-label">ESTABLISHED · NEIGHBOURHOOD · AMUDHAN</div>
              <div className="intro-title-block">
                <div className="intro-title-bar" />
                {data.intro?.title && (
                  <h1 className="intro-hero-title">{data.intro.title.trim()}</h1>
                )}
              </div>
              <div className="intro-author-line">— Kidaa</div>
              <div className="intro-separator" />
              <div className="intro-hero-text">
                {data.intro?.content || "No introductory content available."}
              </div>
              <button className="intro-hero-cta" onClick={() => setView("index")}>
                BEGIN READING →
              </button>
            </div>
          </div>

          {/* ══ MOBILE ONLY: Book Cover — single scrollable column ══ */}
          <div className="m-intro">
            {/* Painting */}
            <div className="m-intro-painting">
              <img src={`${import.meta.env.BASE_URL}author.png`} alt="Author" className="m-intro-painting-img" />
              <div className="m-intro-painting-fade" />
            </div>

            {/* Glossy card */}
            <div className="m-intro-card">
              {/* Avatar */}
              <div className="m-intro-avatar-ring">
                <img src={`${import.meta.env.BASE_URL}author.png`} alt="Kidaa" className="m-intro-avatar-img" />
              </div>

              <button className="m-intro-skip" onClick={() => setView("index")}>Skip ×</button>

              <div className="m-intro-eyebrow">AMUDHAPURANAM · NEIGHBOURHOOD STORIES</div>

              {data.intro?.title && (
                <div className="m-intro-title">{data.intro.title.trim()}</div>
              )}

              <div className="m-intro-byline">— Kidaa</div>
              <div className="m-intro-sep" />

              <div className="m-intro-body">
                {data.intro?.content || "No introductory content available."}
              </div>

              <button className="m-intro-cta" onClick={() => setView("index")}>
                BEGIN READING →
              </button>
            </div>
          </div>

        </div>{/* end .intro-view */}


        {/* ── INDEX / TABLE OF CONTENTS VIEW ── */}
        <div className="index-view" style={{ display: view === "index" ? "flex" : "none" }}>
          <div className="index-header">
            <div className="index-kicker">AMUDHAPURANAM</div>
            <h1 className="index-title">கதைகள்</h1>
            <div className="index-sub">All Stories · Sorted by chapter order · Click any card to read</div>
          </div>
          <div className="index-grid">
            {indexChapters.map((ch, i) => {
              const chars = ch.characters
                .map((cid) => data.characters.find((c) => c.id === cid))
                .filter(Boolean) as Character[];
              const orderNum = ch.chapterOrder ?? ch.timeline;
              return (
                <button
                  key={ch.id}
                  type="button"
                  className="index-card"
                  onClick={() => setActiveChapter(ch)}
                  style={{ animationDelay: `${i * 40}ms` }}
                >
                  <div className="index-card-num">{String(orderNum).padStart(2, "0")}</div>
                  <div className="index-card-body">
                    <div className="index-card-tamil">{ch.title}</div>
                    <div className="index-card-en">{ch.titleEn}</div>
                    {ch.location && (
                      <div className="index-card-loc">{ch.location}</div>
                    )}
                    {chars.length > 0 && (
                      <div className="index-card-chars">
                        {chars.map((c) => (
                          <span
                            key={c.id}
                            className="index-card-char"
                            style={{ background: c.color + "18", border: `1px solid ${c.color}44`, color: c.color }}
                          >
                            {c.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="index-card-arrow">→</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Graph View */}
        <div className="graph-view" style={{ display: view === "graph" ? "block" : "none" }}>
          <div className="graph-touch-hint">Pinch to zoom · Drag nodes</div>
          <ForceGraph
            characters={data.characters} chapters={data.chapters} relationships={data.relationships}
            editMode={false} searchHighlightIds={searchHighlightIds}
            onNodeClick={() => {}}
            onTagClick={(id) => { const ch = data.chapters.find((c) => c.id === id); if (ch) setActiveChapter(ch); }}
          />
          <div id="d3-tooltip" className="tooltip" />

          {/* Character/Relationship Legend */}
          <div className="float-panel legend-panel">
            <div className="fp-title">CHARACTERS</div>
            {data.characters.slice(0, 5).map((c) => (
              <div key={c.id} className="leg-item">
                <div className="leg-dot" style={{ background: c.color }} />
                <span className="leg-name">{c.name.split(" ")[0]}</span>
              </div>
            ))}
          </div>

          <div className="float-panel rel-legend-panel">
            <div className="fp-title">RELATIONSHIPS</div>
            <div className="rel-line"><div className="rel-seg" style={{ background: "var(--primary-600)" }} /><span className="leg-name">Family</span></div>
            <div className="rel-line"><div className="rel-seg" style={{ background: "var(--secondary-600)" }} /><span className="leg-name">Alliance</span></div>
            <div className="rel-line"><div className="rel-seg" style={{ background: "repeating-linear-gradient(90deg,var(--accent-600) 0,var(--accent-600) 4px,transparent 4px,transparent 8px)" }} /><span className="leg-name">Conflict</span></div>
          </div>

          <div className="float-panel instructions-panel">
            <div className="fp-title">EXPLORE</div>
            <div className="inst-item"><span className="inst-key">HOVER</span> node → see chapters</div>
            <div className="inst-item"><span className="inst-key">CLICK</span> chapter tag → read it</div>
            <div className="inst-item"><span className="inst-key">DRAG</span> nodes to rearrange</div>
            <div className="inst-item"><span className="inst-key">SCROLL</span> to zoom · <span className="inst-key">/</span> search</div>
          </div>
        </div>

        {/* ── CENTERED ALTERNATING TIMELINE ── */}
        <div className="timeline-view" style={{ display: view === "timeline" ? "block" : "none" }}>
          <div className="tl-header">
            <div className="tl-main-title">STORY TIMELINE</div>
            <div className="tl-sub">Events in chronological order · Click any chapter to read</div>
          </div>
          <div className="tl-track">
            <div className="tl-rail" />
            <div className="tl-items">
              {sortedChapters.map((ch, idx) => {
                const side = idx % 2 === 0 ? "left" : "right";
                const chars = ch.characters.map((cid) => data.characters.find((c) => c.id === cid)).filter(Boolean) as Character[];
                return (
                  <div
                    key={ch.id}
                    className={`tl-item tl-item--${side}`}
                    onClick={() => setActiveChapter(ch)}
                    tabIndex={0}
                    role="button"
                    onKeyDown={(e) => e.key === "Enter" && setActiveChapter(ch)}
                    style={{ animationDelay: `${idx * 60}ms` }}
                  >
                    <div className="tl-dot">{ch.timeline}</div>
                    <div className="tl-connector" />
                    <div className="tl-card">
                      <div className="tl-num">EVENT {ch.timeline}</div>
                      <div className="tl-title-tamil">{ch.title}</div>
                      <div className="tl-title-en">{ch.titleEn}</div>
                      {ch.location && <div className="tl-location">{ch.location}</div>}
                      <div className="tl-chars">
                        {chars.map((c) => (
                          <span key={c.id} className="tl-char" style={{ background: c.color + "1a", border: `1px solid ${c.color}44`, color: c.color }}>{c.name}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

      </main>

      {/* ── BOTTOM NAV (mobile) ── */}
      <nav className="bottom-nav">
        <div className="bottom-nav-inner">
          <div
            id="bn-intro"
            className={`bn-item ${view === "intro" ? "active" : ""}`}
            onClick={() => setView("intro")}
          >
            <span className="bn-icon">📖</span>
            <span className="bn-label">Intro</span>
          </div>
          <div
            id="bn-index"
            className={`bn-item ${view === "index" ? "active" : ""}`}
            onClick={() => setView("index")}
          >
            <span className="bn-icon">≡</span>
            <span className="bn-label">Stories</span>
          </div>
          <div
            id="bn-graph"
            className={`bn-item ${view === "graph" ? "active" : ""}`}
            onClick={() => setView("graph")}
          >
            <span className="bn-icon">⬡</span>
            <span className="bn-label">Graph</span>
          </div>
          <div
            id="bn-timeline"
            className={`bn-item ${view === "timeline" ? "active" : ""}`}
            onClick={() => setView("timeline")}
          >
            <span className="bn-icon">◈</span>
            <span className="bn-label">Timeline</span>
          </div>
          <div
            id="bn-search"
            className="bn-item"
            onClick={() => { setMobileSearchOpen(true); setTimeout(() => mobileSearchInputRef.current?.focus(), 80); }}
          >
            <span className="bn-icon">⌕</span>
            <span className="bn-label">Search</span>
          </div>
          <a
            id="bn-author"
            className="bn-item"
            href="https://www.instagram.com/the.goated.ink/"
            target="_blank"
            rel="noopener noreferrer"
            style={{ textDecoration: 'none' }}
          >
            <span className="bn-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="2" width="20" height="20" rx="5" ry="5"/>
                <circle cx="12" cy="12" r="4"/>
                <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/>
              </svg>
            </span>
            <span className="bn-label">Author</span>
          </a>
        </div>
      </nav>

      {/* ── MOBILE SEARCH OVERLAY ── */}
      <div className={`search-overlay ${mobileSearchOpen ? "open" : ""}`}>
        <div className="search-overlay-bar">
          <button
            className="search-overlay-back"
            onClick={() => { setMobileSearchOpen(false); clearSearch(); }}
            aria-label="Back"
          >‹</button>
          <input
            ref={mobileSearchInputRef}
            className="search-overlay-input"
            type="text"
            placeholder="Search characters, chapters…"
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
          />
        </div>
        <div className="search-overlay-results">
          {searchQuery && searchResults.characters.length === 0 && searchResults.chapters.length === 0 && (
            <div className="sr-empty">No results found</div>
          )}
          {searchResults.characters.length > 0 && <>
            <div className="sr-group-label">CHARACTERS</div>
            {searchResults.characters.map((c: any) => (
              <div key={c.id} className="sr-item" onClick={() => { handleSearchHit("character", c.id); setMobileSearchOpen(false); }}>
                <span className="sr-badge character">character</span>
                <span className="sr-name">{c.name}</span>
              </div>
            ))}
          </>}
          {searchResults.chapters.length > 0 && <>
            <div className="sr-group-label">CHAPTERS</div>
            {searchResults.chapters.map((ch: any) => (
              <div key={ch.id} className="sr-item" onClick={() => { handleSearchHit("chapter", ch.id); setMobileSearchOpen(false); }}>
                <span className="sr-badge chapter">chapter</span>
                <span className="sr-name">{ch.name}</span>
              </div>
            ))}
          </>}
        </div>
      </div>

      {/* ── CHAPTER MODAL ── */}
      {activeChapter && (
        <div className="chapter-modal" onClick={(e) => e.target === e.currentTarget && setActiveChapter(null)}>
          <div className="modal-panel">
            <div className="sheet-handle" />
            <div className="modal-content">
              <button className="modal-close" onClick={() => setActiveChapter(null)} title="Close (Esc)">×</button>
              <div className="modal-font-controls">
                <button
                  className="modal-font-btn"
                  onClick={() => cycleFontSize(-1)}
                  disabled={fontSize === "sm"}
                  title="Decrease font size"
                >A−</button>
                <span className="modal-font-label">{fontSize.toUpperCase()}</span>
                <button
                  className="modal-font-btn"
                  onClick={() => cycleFontSize(1)}
                  disabled={fontSize === "lg"}
                  title="Increase font size"
                >A+</button>
              </div>
              <div className="modal-hdr">
                <div className="modal-num">CHAPTER {activeChapter.timeline} · {activeChapter.titleEn.toUpperCase()}</div>
                <div className="modal-title">{activeChapter.title}</div>
                {activeChapter.location && <div className="modal-location">{activeChapter.location}</div>}
                <div className="modal-chars">
                  {activeChapter.characters.map((cid) => {
                    const c = data.characters.find((x) => x.id === cid);
                    if (!c) return null;
                    return (
                      <span key={cid} className="modal-char" style={{ background: c.color + "1a", border: `1px solid ${c.color}55`, color: c.color }}>
                        {c.name}
                      </span>
                    );
                  })}
                </div>
              </div>
              
              {/* Progress bar is now fixed below the header, outside the scrolling body */}
              <div className="modal-read-progress-container">
                <div className="modal-read-progress" style={{ width: `${scrollPct}%` }} />
              </div>

              <div
                className="modal-body"
                style={{ "--modal-font-size": fontSizePx[fontSize] } as React.CSSProperties}
                onScroll={handleModalScroll}
              >
                <div className="modal-text">{activeChapter.content}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div id="notif" className="notif" />
    </div>
  );
}
