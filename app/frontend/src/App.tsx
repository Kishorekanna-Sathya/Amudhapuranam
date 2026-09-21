import { useEffect, useState } from "react";
import { loadStoryData, type Character, type Chapter, type StoryData } from "./data/jsonLoader";
import CharacterTree from "./components/CharacterTree";
import StoryTree from "./components/StoryTree";

type View = "graph" | "tree" | "intro" | "index";
type Theme = "light" | "dark";

// ── Theme helpers ─────────────────────────────────────────────────────
function getSystemTheme(): Theme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
function applyTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
}

export default function App() {
  const [data, setData] = useState<StoryData | null>(null);
  const [loading, setLoading] = useState(true);

  const [view, setView] = useState<View>("intro");

  // ── Theme state ───────────────────────────────────────────────────
  const [theme, setTheme] = useState<Theme>("light");
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

  // ── Theme initialisation — runs once on mount ────────────────────
  useEffect(() => {
    const stored = localStorage.getItem("ap-theme") as Theme | null;
    const resolved: Theme = stored ?? getSystemTheme();
    setTheme(resolved);
    applyTheme(resolved);

    // Keep in sync with OS when user hasn't manually set a preference
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onOsChange = (e: MediaQueryListEvent) => {
      if (!localStorage.getItem("ap-theme")) {
        const next: Theme = e.matches ? "dark" : "light";
        setTheme(next);
        applyTheme(next);
      }
    };
    mq.addEventListener("change", onOsChange);
    return () => mq.removeEventListener("change", onOsChange);
  }, []);

  const toggleTheme = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
    localStorage.setItem("ap-theme", next);
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

  // ── Load JSON ────────────────────────────────────────
  useEffect(() => {
    loadStoryData()
      .then((d) => { setData(d); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  // ── Keyboard shortcuts ────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const inInput = (e.target as HTMLElement).matches("input, textarea, select");
      if (e.key === "Escape") { setActiveChapter(null); }
      if (!inInput) {
        if (e.key === "g") setView("graph");
        if (e.key === "t") setView("tree");
        if (e.key === "s") setView("index");
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

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

        <div className="view-controls">
          <button id="btn-intro" className={`btn ${view === "intro" ? "active" : ""}`} onClick={() => setView("intro")}>📖 INTRO</button>
          <button id="btn-index" className={`btn ${view === "index" ? "active" : ""}`} onClick={() => setView("index")}>≡ STORIES</button>
          <button id="btn-graph" className={`btn ${view === "graph" ? "active" : ""}`} onClick={() => setView("graph")}>⬡ CHARACTERS TREE</button>
          <button id="btn-tree" className={`btn ${view === "tree" ? "active" : ""}`} onClick={() => setView("tree")}>◈ STORY TREE</button>
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
          <button
            id="btn-theme-toggle"
            className="theme-toggle-btn"
            onClick={toggleTheme}
            title={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
            aria-label="Toggle theme"
          >
            <span className="theme-toggle-icon">{theme === "dark" ? "☀︎" : "☽"}</span>
            <span className="theme-toggle-label">{theme === "dark" ? "LIGHT" : "DARK"}</span>
          </button>
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

        {/* Characters Tree View */}
        <div className="graph-view" style={{ display: view === "graph" ? "block" : "none", position: "absolute", inset: 0 }}>
          <CharacterTree
            characters={data.characters} chapters={data.chapters} relationships={data.relationships}
            editMode={false} searchHighlightIds={[]}
            onNodeClick={() => {}}
            onTagClick={(id) => { const ch = data.chapters.find((c) => c.id === id); if (ch) setActiveChapter(ch); }}
          />
        </div>

        {/* ── STORY TREE HIERARCHY VIEW ── */}
        <div className="story-tree-view" style={{ display: view === "tree" ? "block" : "none", position: "absolute", inset: 0 }}>
          <StoryTree
            chapters={data.chapters}
            characters={data.characters}
            onSelectChapter={(ch) => setActiveChapter(ch)}
          />
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
            <span className="bn-label">Chars</span>
          </div>
          <div
            id="bn-tree"
            className={`bn-item ${view === "tree" ? "active" : ""}`}
            onClick={() => setView("tree")}
          >
            <span className="bn-icon">◈</span>
            <span className="bn-label">Tree</span>
          </div>
          {/* Theme toggle */}
          <div
            id="bn-theme"
            className="bn-item bn-theme-highlight"
            onClick={toggleTheme}
            title={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
          >
            <span className="bn-icon">{theme === "dark" ? "☀︎" : "☽"}</span>
            <span className="bn-label">{theme === "dark" ? "Light" : "Dark"}</span>
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
