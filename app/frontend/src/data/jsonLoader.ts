export interface Character {
  id: string;
  name: string;
  role: string;        // e.g. "Protagonist", "Friend"
  color: string;
  description: string;
  chapters?: string[];
}

export interface Chapter {
  id: string;
  timeline: number;
  chapterOrder?: number;  // display sort order for the index/TOC page
  titleEn: string;
  title: string;
  location: string;
  characters: string[];
  content: string;
  parent_story?: string[];
}

export interface Relationship {
  id: string;
  source: string;
  target: string;
  type: string;
  label: string;
  description?: string;
}

export interface StoryData {
  characters: Character[];
  chapters: Chapter[];
  relationships: Relationship[];
  intro?: { title?: string; content: string };
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to load ${path}`);
  return res.json() as Promise<T>;
}

export async function loadStoryData(): Promise<StoryData> {
  const [charsData, chapsData, relsData, introData] = await Promise.all([
    fetchJson<{ characters: Character[] }>(`${import.meta.env.BASE_URL}stories/characters.json`),
    fetchJson<{ chapters: Chapter[] }>(`${import.meta.env.BASE_URL}stories/chapters.json`),
    fetchJson<{ relationships: Relationship[] }>(`${import.meta.env.BASE_URL}stories/relationships.json`),
    fetchJson<{ title?: string; content: string }>(`${import.meta.env.BASE_URL}stories/intro.json`).catch(() => undefined),
  ]);

  const characters: Character[] = charsData.characters.map((char) => ({
    ...char,
    chapters: chapsData.chapters
      .filter((chap) => Array.isArray(chap.characters) && chap.characters.includes(char.id))
      .map((chap) => chap.id),
  }));

  return {
    characters,
    chapters: chapsData.chapters,
    relationships: relsData.relationships,
    intro: introData,
  };
}
