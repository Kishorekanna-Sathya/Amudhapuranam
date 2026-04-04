import { load } from "js-yaml";

export interface Character {
  id: string;
  name: string;
  role: string;        // e.g. "Lord Commander", "Queen", "Advisor"
  color: string;
  description: string;
  chapters: string[];
}

export interface Chapter {
  id: string;
  timeline: number;
  titleEn: string;
  title: string;
  location: string;   // e.g. "Winterfell", "King's Landing"
  characters: string[];
  content: string;
}

export interface Relationship {
  id: string;
  source: string;
  target: string;
  type: "family" | "alliance" | "conflict";
  label: string;
}

export interface StoryData {
  characters: Character[];
  chapters: Chapter[];
  relationships: Relationship[];
  intro?: { title?: string; content: string };
}

async function fetchYaml<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to load ${path}`);
  const text = await res.text();
  return load(text) as T;
}

export async function loadStoryData(): Promise<StoryData> {
  const [charsData, chapsData, relsData, introData] = await Promise.all([
    fetchYaml<{ characters: Character[] }>(`${import.meta.env.BASE_URL}stories/characters.yaml`),
    fetchYaml<{ chapters: Chapter[] }>(`${import.meta.env.BASE_URL}stories/chapters.yaml`),
    fetchYaml<{ relationships: Relationship[] }>(`${import.meta.env.BASE_URL}stories/relationships.yaml`),
    fetchYaml<{ title?: string; content: string }>(`${import.meta.env.BASE_URL}stories/intro.yaml`).catch(() => undefined),
  ]);

  return {
    characters: charsData.characters,
    chapters: chapsData.chapters,
    relationships: relsData.relationships,
    intro: introData,
  };
}
