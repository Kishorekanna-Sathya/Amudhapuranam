# 🏰 Neighbourhood Amudhan · கதை வலையமைப்பு

A **modern interactive non-linear storytelling web application** that visualizes a story as a dynamic, explorable graph. Built with a premium dark fantasy aesthetic and story content written in **Tamil**.

![Dark Fantasy UI](https://img.shields.io/badge/Design-Dark%20Fantasy-7c3aed?style=for-the-badge)
![React](https://img.shields.io/badge/React-18-61dafb?style=for-the-badge&logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?style=for-the-badge&logo=typescript)
![Vite](https://img.shields.io/badge/Vite-5-646CFF?style=for-the-badge&logo=vite)

---

## ✨ Features

| Feature | Description |
|---|---|
| 🕸️ **Character Graph** | Dynamic force-directed graph (D3.js) — characters as nodes, relationships as edges |
| 📖 **Story Content** | Interactive Tamil story reading experience within a premium "book" interface |
| 🔍 **Global Search** | Fuzzy search across characters, chapters, and Tamil content |
| ⏱️ **Timeline View** | Chronological chapter timeline with character context |
| ✏️ **Edit Mode** | Add/update/delete characters, chapters, and relationships (client-side) |
| 🌙 **Premium UI** | Dark fantasy glassmorphism design with sleek animations |

---

## 🚀 Quick Start

```bash
# Clone and start
cd app/frontend
npm install
npm run dev
```

- **Local URL**: [http://localhost:3000](http://localhost:3000)

---

## 🏗️ Project Structure

```
/
├── docker-compose.yml
├── README.md
└── app/
    └── frontend/
        ├── public/
        │   └── stories/        ← Story data in YAML format
        ├── src/
        │   ├── main.tsx
        │   ├── App.tsx         ← Main application & inline components
        │   ├── index.css       ← Design system & styles
        │   ├── data/           ← YAML data loader
        │   └── components/     ← Shared React components (D3 Graph)
```

---

## 📊 Data Schema (YAML)

```yaml
# characters.yaml
characters:
  - id: "char-id"
    name: "Character Name"
    role: "Role/Title"
    color: "#hex-color"
    description: "Brief bio"
    chapters: ["ch-1"]

# chapters.yaml
chapters:
  - id: "ch-1"
    timeline: 1
    title: "தலைப்பு (Tamil)"
    titleEn: "Title (English)"
    location: "Setting"
    characters: ["char-id"]
    content: "Full story content in Tamil..."
```

---

## 🔧 Tech Stack

| Layer | Technology |
|---|---|
| Frontend Framework | React 18 + TypeScript |
| Graph Visualization | D3.js (Force Simulation) |
| Search | Fuse.js (client-side fuzzy search) |
| Data Format | YAML (js-yaml) |
| Build Tool | Vite 5 |
| Styling | Vanilla CSS (Dark Fantasy design) |
| Fonts | Inter + Cinzel + Noto Sans Tamil |
| Containerization | Docker |
