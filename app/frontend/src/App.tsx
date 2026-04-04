import { useEffect, useState, useRef, useCallback } from "react";
import Fuse from "fuse.js";
import { loadStoryData, type Character, type Chapter, type Relationship, type StoryData } from "./data/yamlLoader";
import ForceGraph from "./components/ForceGraph";

type View = "graph" | "timeline" | "intro";
type EditTab = "characters" | "chapters" | "relations";

function notify(msg: string) {
  const el = document.getElementById("notif");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout((el as any)._t);
  (el as any)._t = setTimeout(() => el.classList.remove("show"), 2600);
}

// ── Unique ID generator ─────────────────────────────────
function uid() {
  return Math.random().toString(36).slice(2, 9);
}

export default function App() {
  const [data, setData] = useState<StoryData | null>(null);
  const [loading, setLoading] = useState(true);

  const [view, setView] = useState<View>("intro");
  const [editMode, setEditMode] = useState(false);
  const [editTab, setEditTab] = useState<EditTab>("characters");

  // Modal
  const [activeChapter, setActiveChapter] = useState<Chapter | null>(null);

  // Search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{ characters: any[]; chapters: any[] }>({ characters: [], chapters: [] });
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchHighlightIds, setSearchHighlightIds] = useState<string[]>([]);

  // Edit state — character form
  const [selectedChar, setSelectedChar] = useState<Character | null>(null);
  const [charForm, setCharForm] = useState<Partial<Character>>({});

  // Edit state — chapter form
  const [selectedChap, setSelectedChap] = useState<Chapter | null>(null);
  const [chapForm, setChapForm] = useState<Partial<Chapter>>({});

  // Edit state — relation form
  const [relForm, setRelForm] = useState<Partial<Relationship>>({ type: "family" });

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
        if (e.key === "e") toggleEdit();
      }
      if (e.key === "/" && !inInput) { e.preventDefault(); searchInputRef.current?.focus(); }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [editMode]);

  function toggleEdit() {
    setEditMode((prev) => {
      notify(prev ? "Edit mode OFF" : "Edit mode ON");
      return !prev;
    });
    setSelectedChar(null);
    setSelectedChap(null);
  }

  // ── Character CRUD ────────────────────────────────────
  function selectChar(c: Character) {
    setSelectedChar(c);
    setCharForm({ ...c });
    setEditTab("characters");
  }

  function saveCharacter() {
    if (!data || !selectedChar) return;
    const updated = data.characters.map((c) =>
      c.id === selectedChar.id ? { ...c, ...charForm } as Character : c
    );
    setData({ ...data, characters: updated });
    buildFuse({ ...data, characters: updated });
    setSelectedChar(null);
    notify("Character updated ✓");
  }

  function addCharacter() {
    if (!data) return;
    const newChar: Character = {
      id: uid(), name: "New Character", role: "", color: "#888888",
      description: "", chapters: [],
    };
    const updated = [...data.characters, newChar];
    setData({ ...data, characters: updated });
    buildFuse({ ...data, characters: updated });
    selectChar(newChar);
    notify("New character added — fill in the details");
  }

  function deleteCharacter() {
    if (!data || !selectedChar) return;
    if (!confirm(`Delete "${selectedChar.name}"?`)) return;
    const updated = data.characters.filter((c) => c.id !== selectedChar.id);
    // Remove from all chapter refs & relationships
    const updatedChaps = data.chapters.map((ch) => ({
      ...ch,
      characters: ch.characters.filter((id) => id !== selectedChar.id),
    }));
    const updatedRels = data.relationships.filter(
      (r) => r.source !== selectedChar.id && r.target !== selectedChar.id
    );
    const newData = { ...data, characters: updated, chapters: updatedChaps, relationships: updatedRels };
    setData(newData);
    buildFuse(newData);
    setSelectedChar(null);
    setCharForm({});
    notify("Character deleted");
  }

  // ── Chapter CRUD ──────────────────────────────────────
  function selectChap(ch: Chapter) {
    setSelectedChap(ch);
    setChapForm({ ...ch });
    setEditTab("chapters");
  }

  function saveChapter() {
    if (!data || !selectedChap) return;
    const updated = data.chapters.map((c) =>
      c.id === selectedChap.id ? { ...c, ...chapForm } as Chapter : c
    );
    setData({ ...data, chapters: updated });
    buildFuse({ ...data, chapters: updated });
    setSelectedChap(null);
    notify("Chapter updated ✓");
  }

  function addChapter() {
    if (!data) return;
    const maxTl = data.chapters.reduce((m, c) => Math.max(m, c.timeline), 0);
    const newChap: Chapter = {
      id: uid(), timeline: maxTl + 1, titleEn: "New Chapter",
      title: "புதிய அத்தியாயம்", location: "", characters: [], content: "",
    };
    const updated = [...data.chapters, newChap];
    setData({ ...data, chapters: updated });
    buildFuse({ ...data, chapters: updated });
    selectChap(newChap);
    notify("New chapter added — fill in the details");
  }

  function deleteChapter() {
    if (!data || !selectedChap) return;
    if (!confirm(`Delete "${selectedChap.titleEn}"?`)) return;
    const updated = data.chapters.filter((c) => c.id !== selectedChap.id);
    // Remove from character chapter refs
    const updatedChars = data.characters.map((c) => ({
      ...c,
      chapters: c.chapters.filter((id) => id !== selectedChap.id),
    }));
    const newData = { ...data, chapters: updated, characters: updatedChars };
    setData(newData);
    buildFuse(newData);
    setSelectedChap(null);
    setChapForm({});
    notify("Chapter deleted");
  }

  // Remove / add character reference from a chapter
  function toggleCharInChap(charId: string) {
    const chars = (chapForm.characters ?? []);
    setChapForm({
      ...chapForm,
      characters: chars.includes(charId) ? chars.filter((x) => x !== charId) : [...chars, charId],
    });
  }

  // ── Relationship CRUD ──────────────────────────────────
  function addRelationship() {
    if (!data || !relForm.source || !relForm.target || !relForm.label) {
      notify("Fill in source, target and label"); return;
    }
    if (relForm.source === relForm.target) { notify("Source and target must differ"); return; }
    const newRel: Relationship = {
      id: uid(), source: relForm.source!, target: relForm.target!,
      type: (relForm.type ?? "family") as "family" | "alliance" | "conflict",
      label: relForm.label!,
    };
    const updated = [...data.relationships, newRel];
    setData({ ...data, relationships: updated });
    setRelForm({ type: "family" });
    notify("Relationship added ✓");
  }

  function deleteRelationship(id: string) {
    if (!data) return;
    setData({ ...data, relationships: data.relationships.filter((r) => r.id !== id) });
    notify("Relationship removed");
  }

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
        <div className="loading-logo">AMUDHA PURANAM</div>
        <div className="loading-text">Loading story…</div>
        <div className="loading-bar"><div className="loading-fill" /></div>
      </div>
    );
  }
  if (!data) return <div className="loading-screen">Failed to load story data.</div>;

  const sortedChapters = [...data.chapters].sort((a, b) => a.timeline - b.timeline);

  return (
    <div className="app-shell">
      {/* ── HEADER ── */}
      <header className="header">
        <div className="logo">AMUDHA PURANAM<small>Neighbourhood Amudhan</small></div>
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
          <button id="btn-graph" className={`btn ${view === "graph" ? "active" : ""}`} onClick={() => setView("graph")}>⬡ GRAPH</button>
          <button id="btn-timeline" className={`btn ${view === "timeline" ? "active" : ""}`} onClick={() => setView("timeline")}>◈ TIMELINE</button>
          <button id="btn-edit" className={`btn ${editMode ? "edit-on" : ""}`} onClick={toggleEdit} disabled title="Edit Mode - Coming Soon">✎ EDIT</button>
        </div>
      </header>

      {/* ── MAIN ── */}
      <main className="main-area">

        {/* Intro View */}
        <div className="intro-view" style={{ display: view === "intro" ? "flex" : "none" }}>
          <div className="intro-book-window">
            <button className="intro-close" onClick={() => setView("graph")} title="Go to Graph">×</button>
            <div className="intro-left">
              <img src={`${import.meta.env.BASE_URL}author.png`} alt="Author" className="intro-author-photo" />
            </div>
            <div className="intro-right">
              <div className="intro-text-scroll">
                {data.intro?.title && (
                  <h1 className="intro-title">{data.intro.title.trim()}</h1>
                )}
                <div className="intro-text">
                  {data.intro?.content || "No introductory content available."}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Graph View */}
        <div className="graph-view" style={{ display: view === "graph" ? "block" : "none" }}>
          <ForceGraph
            characters={data.characters} chapters={data.chapters} relationships={data.relationships}
            editMode={editMode} searchHighlightIds={searchHighlightIds}
            onNodeClick={(char) => { selectChar(char); if (!editMode) toggleEdit(); }}
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

        {/* Timeline View */}
        <div className="timeline-view" style={{ display: view === "timeline" ? "block" : "none" }}>
          <div className="tl-header">
            <div className="tl-main-title">STORY TIMELINE</div>
            <div className="tl-sub">Events in chronological order · Click any chapter to read</div>
          </div>
          <div className="tl-track">
            <div className="tl-rail" />
            <div className="tl-items">
              {sortedChapters.map((ch) => {
                const chars = ch.characters.map((cid) => data.characters.find((c) => c.id === cid)).filter(Boolean) as Character[];
                return (
                  <div key={ch.id} className="tl-item" onClick={() => setActiveChapter(ch)} tabIndex={0} role="button" onKeyDown={(e) => e.key === "Enter" && setActiveChapter(ch)}>
                    <div className="tl-dot" />
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
                );
              })}
            </div>
          </div>
        </div>

        {/* ════════ EDIT PANEL ════════ */}
        <div className={`edit-panel ${editMode ? "open" : ""}`}>
          {/* Header */}
          <div className="ep-header">
            <div className="ep-title">✎ STORY EDITOR</div>
            <button className="ep-close-btn" onClick={toggleEdit} title="Close edit mode">×</button>
          </div>

          {/* Tab bar */}
          <div className="ep-tabs">
            {(["characters", "chapters", "relations"] as EditTab[]).map((t) => (
              <button
                key={t} className={`ep-tab ${editTab === t ? "active" : ""}`}
                onClick={() => { setEditTab(t); setSelectedChar(null); setSelectedChap(null); }}
                disabled
                style={{ cursor: "not-allowed", opacity: 0.6 }}
                title="Selection disabled"
              >
                {t === "characters" ? "⬡ CHARS" : t === "chapters" ? "◈ CHAPTERS" : "↔ RELATIONS"}
              </button>
            ))}
          </div>

          <div className="ep-body">

            {/* ══ CHARACTERS TAB ══ */}
            {editTab === "characters" && !selectedChar && (
              <>
                <div className="ep-section" style={{ marginTop: 0, paddingTop: 0, borderTop: "none" }}>
                  <span>ALL CHARACTERS ({data.characters.length})</span>
                  <button className="ep-btn ep-btn-primary ep-btn-sm" onClick={addCharacter}>+ ADD</button>
                </div>
                {data.characters.map((c) => (
                  <div key={c.id} className="ep-chapter-card" onClick={() => selectChar(c)} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <div style={{ width: 12, height: 12, borderRadius: "50%", background: c.color, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="ep-chapter-card-title" style={{ fontFamily: "Cinzel, serif", fontSize: "13px" }}>{c.name}</div>
                      <div className="ep-chapter-card-en">{c.role}</div>
                    </div>
                    <span style={{ fontSize: "11px", color: "var(--text3)" }}>{c.chapters.length} ch</span>
                  </div>
                ))}
              </>
            )}

            {editTab === "characters" && selectedChar && (
              <>
                <div className="ep-section" style={{ marginTop: 0, paddingTop: 0, borderTop: "none" }}>
                  <span>EDIT CHARACTER</span>
                  <button className="ep-btn ep-btn-secondary ep-btn-sm" onClick={() => { setSelectedChar(null); setCharForm({}); }}>← BACK</button>
                </div>

                <div className="ep-field">
                  <label className="ep-label">NAME</label>
                  <input className="ep-input" value={charForm.name ?? ""} onChange={(e) => setCharForm({ ...charForm, name: e.target.value })} />
                </div>
                <div className="ep-field">
                  <label className="ep-label">ROLE / TITLE</label>
                  <input className="ep-input" value={charForm.role ?? ""} onChange={(e) => setCharForm({ ...charForm, role: e.target.value })} placeholder="e.g. Lord Commander" />
                </div>
                <div className="ep-field">
                  <label className="ep-label">NODE COLOUR</label>
                  <div className="ep-color-row">
                    <div className="ep-color-preview" style={{ background: charForm.color ?? "var(--surface2)" }} />
                    <input className="ep-input ep-color-hex" value={charForm.color ?? ""} onChange={(e) => setCharForm({ ...charForm, color: e.target.value })} placeholder="var(--primary-600)" />
                    <input type="color" value={charForm.color ?? "#999999"} onChange={(e) => setCharForm({ ...charForm, color: e.target.value })} style={{ width: 36, height: 32, padding: 2, border: "1px solid var(--border)", borderRadius: 4, cursor: "pointer" }} />
                  </div>
                </div>
                <div className="ep-field">
                  <label className="ep-label">DESCRIPTION</label>
                  <textarea className="ep-textarea" style={{ fontFamily: "Crimson Pro, serif", fontSize: "14px", minHeight: 70 }} value={charForm.description ?? ""} onChange={(e) => setCharForm({ ...charForm, description: e.target.value })} rows={3} />
                </div>

                <div className="ep-section">LINKED CHAPTERS</div>
                <div className="ep-chips">
                  {(charForm.chapters ?? []).map((cid) => {
                    const ch = data.chapters.find((c) => c.id === cid);
                    if (!ch) return null;
                    return (
                      <span key={cid} className="ep-chip">
                        {ch.title}
                        <button className="ep-chip-remove" onClick={() => setCharForm({ ...charForm, chapters: (charForm.chapters ?? []).filter((x) => x !== cid) })}>×</button>
                      </span>
                    );
                  })}
                  {(charForm.chapters ?? []).length === 0 && <span style={{ color: "var(--text3)", fontSize: "12px" }}>No chapters linked</span>}
                </div>
                <select className="ep-select ep-field" value="" onChange={(e) => { if (e.target.value && !(charForm.chapters ?? []).includes(e.target.value)) setCharForm({ ...charForm, chapters: [...(charForm.chapters ?? []), e.target.value] }); }}>
                  <option value="">+ Link a chapter…</option>
                  {data.chapters.filter((ch) => !(charForm.chapters ?? []).includes(ch.id)).map((ch) => (
                    <option key={ch.id} value={ch.id}>{ch.titleEn} ({ch.title})</option>
                  ))}
                </select>

                <div className="ep-actions">
                  <button className="ep-btn ep-btn-primary" onClick={saveCharacter}>SAVE</button>
                  <button className="ep-btn ep-btn-danger" onClick={deleteCharacter}>DELETE</button>
                </div>
              </>
            )}

            {/* ══ CHAPTERS TAB ══ */}
            {editTab === "chapters" && !selectedChap && (
              <>
                <div className="ep-section" style={{ marginTop: 0, paddingTop: 0, borderTop: "none" }}>
                  <span>ALL CHAPTERS ({data.chapters.length})</span>
                  <button className="ep-btn ep-btn-primary ep-btn-sm" onClick={addChapter}>+ ADD</button>
                </div>
                {sortedChapters.map((ch) => (
                  <div key={ch.id} className="ep-chapter-card" onClick={() => selectChap(ch)}>
                    <div className="ep-chapter-card-title">{ch.title}</div>
                    <div className="ep-chapter-card-en">#{ch.timeline} · {ch.titleEn}</div>
                    {ch.location && <div className="ep-chapter-card-loc">📍 {ch.location}</div>}
                  </div>
                ))}
              </>
            )}

            {editTab === "chapters" && selectedChap && (
              <>
                <div className="ep-section" style={{ marginTop: 0, paddingTop: 0, borderTop: "none" }}>
                  <span>EDIT CHAPTER</span>
                  <button className="ep-btn ep-btn-secondary ep-btn-sm" onClick={() => { setSelectedChap(null); setChapForm({}); }}>← BACK</button>
                </div>

                <div className="ep-row">
                  <div className="ep-field">
                    <label className="ep-label">TIMELINE #</label>
                    <input className="ep-input" type="number" value={chapForm.timeline ?? ""} onChange={(e) => setChapForm({ ...chapForm, timeline: Number(e.target.value) })} />
                  </div>
                  <div className="ep-field">
                    <label className="ep-label">TITLE (EN)</label>
                    <input className="ep-input" value={chapForm.titleEn ?? ""} onChange={(e) => setChapForm({ ...chapForm, titleEn: e.target.value })} />
                  </div>
                </div>
                <div className="ep-field">
                  <label className="ep-label">TITLE (TAMIL)</label>
                  <input className="ep-input tamil-font" value={chapForm.title ?? ""} onChange={(e) => setChapForm({ ...chapForm, title: e.target.value })} />
                </div>
                <div className="ep-field">
                  <label className="ep-label">LOCATION</label>
                  <input className="ep-input" value={chapForm.location ?? ""} onChange={(e) => setChapForm({ ...chapForm, location: e.target.value })} placeholder="e.g. Winterfell" />
                </div>
                <div className="ep-field">
                  <label className="ep-label">CONTENT (TAMIL)</label>
                  <textarea className="ep-textarea" value={chapForm.content ?? ""} onChange={(e) => setChapForm({ ...chapForm, content: e.target.value })} rows={8} />
                </div>

                <div className="ep-section">CHARACTERS IN THIS CHAPTER</div>
                <div className="ep-chips">
                  {(chapForm.characters ?? []).map((cid) => {
                    const c = data.characters.find((x) => x.id === cid);
                    if (!c) return null;
                    return (
                      <span key={cid} className="ep-chip" style={{ borderColor: c.color + "44" }}>
                        <span style={{ color: c.color }}>●</span> {c.name}
                        <button className="ep-chip-remove" onClick={() => toggleCharInChap(cid)}>×</button>
                      </span>
                    );
                  })}
                  {(chapForm.characters ?? []).length === 0 && <span style={{ color: "var(--text3)", fontSize: "12px" }}>No characters tagged</span>}
                </div>
                <select className="ep-select ep-field" value="" onChange={(e) => { if (e.target.value) toggleCharInChap(e.target.value); }}>
                  <option value="">+ Tag a character…</option>
                  {data.characters.filter((c) => !(chapForm.characters ?? []).includes(c.id)).map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>

                <div className="ep-actions">
                  <button className="ep-btn ep-btn-primary" onClick={saveChapter}>SAVE</button>
                  <button className="ep-btn ep-btn-danger" onClick={deleteChapter}>DELETE</button>
                </div>
              </>
            )}

            {/* ══ RELATIONS TAB ══ */}
            {editTab === "relations" && (
              <>
                {/* Existing relationships */}
                <div className="ep-section" style={{ marginTop: 0, paddingTop: 0, borderTop: "none" }}>
                  <span>RELATIONSHIPS ({data.relationships.length})</span>
                </div>
                {data.relationships.map((r) => {
                  const src = data.characters.find((c) => c.id === r.source);
                  const tgt = data.characters.find((c) => c.id === r.target);
                  return (
                    <div key={r.id} className="ep-rel-card">
                      <span className={`ep-rel-type ${r.type}`}>{r.type}</span>
                      <div className="ep-rel-names">
                        <span style={{ color: src?.color }}>{src?.name ?? r.source}</span>
                        {" → "}
                        <span style={{ color: tgt?.color }}>{tgt?.name ?? r.target}</span>
                      </div>
                      <div className="ep-rel-label">"{r.label}"</div>
                      <button className="ep-rel-del" onClick={() => deleteRelationship(r.id)}>×</button>
                    </div>
                  );
                })}

                {/* Add new relationship */}
                <div className="ep-section">ADD NEW RELATIONSHIP</div>

                <div className="ep-field">
                  <label className="ep-label">SOURCE CHARACTER</label>
                  <select className="ep-select" value={relForm.source ?? ""} onChange={(e) => setRelForm({ ...relForm, source: e.target.value })}>
                    <option value="">Select source…</option>
                    {data.characters.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="ep-field">
                  <label className="ep-label">TARGET CHARACTER</label>
                  <select className="ep-select" value={relForm.target ?? ""} onChange={(e) => setRelForm({ ...relForm, target: e.target.value })}>
                    <option value="">Select target…</option>
                    {data.characters.filter((c) => c.id !== relForm.source).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                <div className="ep-row">
                  <div className="ep-field">
                    <label className="ep-label">TYPE</label>
                    <select className="ep-select" value={relForm.type ?? "family"} onChange={(e) => setRelForm({ ...relForm, type: e.target.value as any })}>
                      <option value="family">Family</option>
                      <option value="alliance">Alliance</option>
                      <option value="conflict">Conflict</option>
                    </select>
                  </div>
                  <div className="ep-field">
                    <label className="ep-label">LABEL</label>
                    <input className="ep-input" value={relForm.label ?? ""} onChange={(e) => setRelForm({ ...relForm, label: e.target.value })} placeholder="e.g. Siblings" />
                  </div>
                </div>
                <button className="ep-btn ep-btn-primary ep-btn-full" onClick={addRelationship}>
                  + ADD RELATIONSHIP
                </button>
              </>
            )}
          </div>
        </div>
      </main>

      {/* ── CHAPTER MODAL ── */}
      {activeChapter && (
        <div className="chapter-modal" onClick={(e) => e.target === e.currentTarget && setActiveChapter(null)}>
          <div className="modal-panel">
            <div className="modal-content">
              <button className="modal-close" onClick={() => setActiveChapter(null)} title="Close (Esc)">×</button>
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
              <div className="modal-body">
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
