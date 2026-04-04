import { useEffect, useRef } from "react";
import * as d3 from "d3";
import type { Character, Chapter, Relationship } from "../data/yamlLoader";

interface Props {
  characters: Character[];
  chapters: Chapter[];
  relationships: Relationship[];
  editMode: boolean;
  searchHighlightIds: string[];
  onNodeClick: (char: Character) => void;
  onTagClick: (chapterId: string) => void;
}

const REL_COLORS: Record<string, string> = {
  family: "var(--pink)",
  alliance: "var(--cyan)",
  conflict: "var(--pink-dim)",
  friend: "var(--cyan-light)",
};

export default function ForceGraph({
  characters,
  chapters,
  relationships,
  editMode,
  searchHighlightIds,
  onNodeClick,
  onTagClick,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!svgRef.current || !containerRef.current || characters.length === 0) return;

    const container = containerRef.current;
    const W = container.clientWidth;
    const H = container.clientHeight;
    const svg = d3.select(svgRef.current);

    svg.selectAll("*").remove();

    // ── Defs ──────────────────────────────────────────────
    const defs = svg.append("defs");

    Object.entries(REL_COLORS).forEach(([type, col]) => {
      defs
        .append("marker")
        .attr("id", `arr-${type}`)
        .attr("viewBox", "0 -5 10 10")
        .attr("refX", 50)
        .attr("refY", 0)
        .attr("markerWidth", 6)
        .attr("markerHeight", 6)
        .attr("orient", "auto")
        .append("path")
        .attr("d", "M0,-5L10,0L0,5")
        .attr("fill", col)
        .attr("opacity", 0.5);
    });

    // Soft glow for nodes
    const glow = defs.append("filter").attr("id", "node-glow").attr("x", "-30%").attr("y", "-30%").attr("width", "160%").attr("height", "160%");
    glow.append("feGaussianBlur").attr("stdDeviation", "3").attr("result", "blur");
    const fm = glow.append("feMerge");
    fm.append("feMergeNode").attr("in", "blur");
    fm.append("feMergeNode").attr("in", "SourceGraphic");

    // Grid pattern (light)
    const grid = defs
      .append("pattern")
      .attr("id", "grid-pat")
      .attr("width", 44)
      .attr("height", 44)
      .attr("patternUnits", "userSpaceOnUse");
    grid
      .append("path")
      .attr("d", "M44 0L0 0 0 44")
      .attr("fill", "none")
      .attr("stroke", "var(--border)")
      .attr("stroke-width", 0.5);

    // ── Zoom ──────────────────────────────────────────────
    const zoomBeh = d3.zoom<SVGSVGElement, unknown>().scaleExtent([0.25, 3.5]).on("zoom", (ev) => {
      zoomG.attr("transform", ev.transform);
    });
    svg.call(zoomBeh);

    // Background
    svg.append("rect").attr("width", "100%").attr("height", "100%").attr("fill", "url(#grid-pat)");

    const zoomG = svg.append("g");

    // ── Simulation data ─────────────────────────────────
    const nodes: d3.SimulationNodeDatum[] = characters.map((c) => ({
      ...(c as object),
      id: c.id,
      x: W / 2 + (Math.random() - 0.5) * 400,
      y: H / 2 + (Math.random() - 0.5) * 300,
    })) as (d3.SimulationNodeDatum & Character)[];

    const links = relationships.map((r) => ({ ...r }));

    // ── Simulation ────────────────────────────────────────
    const simulation = d3
      .forceSimulation(nodes)
      .force("link", d3.forceLink(links).id((d: d3.SimulationNodeDatum) => (d as Character).id).distance(190).strength(0.25))
      .force("charge", d3.forceManyBody().strength(-550))
      .force("center", d3.forceCenter(W / 2, H / 2))
      .force("collision", d3.forceCollide(62));

// ── Links ─────────────────────────────────────────────
    const linkG = zoomG.append("g");
    const $links = linkG
      .selectAll("line")
      .data(links)
      .enter()
      .append("line")
      .attr("stroke", (d: any) => REL_COLORS[(d.type || "").toLowerCase()] || "var(--text-300)")
      .attr("stroke-opacity", 0.45)
      .attr("stroke-width", 1.5)
      .attr("stroke-dasharray", (d: any) => ((d.type || "").toLowerCase() === "conflict" ? "6,4" : null))
      .attr("marker-end", (d: any) => `url(#arr-${(d.type || "").toLowerCase()})`);

    // ── Link labels ────────────────────────────────────────
    const lblG = zoomG.append("g");
    const $linkLabels = lblG
      .selectAll("text")
      .data(links)
      .enter()
      .append("text")
      .attr("fill", "var(--text-400)")
      .attr("font-size", "9.5px")
      .attr("font-family", "Cinzel, serif")
      .attr("text-anchor", "middle")
      .attr("letter-spacing", "0.5px")
      .style("pointer-events", "none")
      .text((d: any) => d.label);

    // ── Node groups ───────────────────────────────────────
    const nodeG = zoomG.append("g");
    const $nodes = nodeG
      .selectAll<SVGGElement, Character & d3.SimulationNodeDatum>("g.node")
      .data(nodes as (Character & d3.SimulationNodeDatum)[])
      .enter()
      .append("g")
      .attr("class", "node")
      .style("cursor", "pointer")
      .call(
        d3
          .drag<SVGGElement, Character & d3.SimulationNodeDatum>()
          .on("start", (ev, d) => {
            if (!ev.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on("drag", (ev, d) => {
            d.fx = ev.x;
            d.fy = ev.y;
          })
          .on("end", (ev, d) => {
            if (!ev.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          })
      );

    // Pulse ring
    $nodes
      .append("circle")
      .attr("r", 46)
      .attr("fill", "none")
      .attr("stroke", (d) => d.color)
      .attr("stroke-width", 1.5)
      .attr("stroke-opacity", 0)
      .attr("filter", "url(#node-glow)")
      .attr("class", "node-ring");

    // Main circle
    $nodes
      .append("circle")
      .attr("r", 34)
      .attr("fill", (d) => d.color + "22")
      .attr("stroke", (d) => d.color)
      .attr("stroke-width", 2)
      .attr("class", "node-circle");

    // Initials
    $nodes
      .append("text")
      .attr("text-anchor", "middle")
      .attr("dy", "0.35em")
      .attr("fill", (d) => d.color)
      .attr("font-family", "Cinzel, serif")
      .attr("font-size", "15px")
      .attr("font-weight", "700")
      .style("pointer-events", "none")
      .text((d) =>{
        const parts = d.name.split(" ");
        return parts.map((w: string) => w[0]).join("").slice(0, 2);
      });

    // Name label
    $nodes
      .append("text")
      .attr("text-anchor", "middle")
      .attr("dy", "50px")
      .attr("fill", "var(--text-600)")
      .attr("font-family", "Cinzel, serif")
      .attr("font-size", "10.5px")
      .attr("letter-spacing", "1.5px")
      .style("pointer-events", "none")
      .attr("data-role", "name")
      .text((d) => d.name.split(" ")[0].toUpperCase());

    // Role sub-label
    $nodes
      .append("text")
      .attr("text-anchor", "middle")
      .attr("dy", "62px")
      .attr("fill", "var(--text-400)")
      .attr("font-family", "Cinzel, serif")
      .attr("font-size", "8.5px")
      .attr("letter-spacing", "0.8px")
      .style("pointer-events", "none")
      .text((d) => (d.role ?? "").split(" ")[0].toUpperCase());

    // Chapter count badge
    $nodes
      .append("circle")
      .attr("cx", 26)
      .attr("cy", -26)
      .attr("r", 9)
      .attr("fill", (d) => d.color + "33")
      .attr("stroke", (d) => d.color)
      .attr("stroke-width", 1)
      .style("pointer-events", "none");
    $nodes
      .append("text")
      .attr("x", 26)
      .attr("y", -26)
      .attr("text-anchor", "middle")
      .attr("dy", "0.35em")
      .attr("fill", (d) => d.color)
      .attr("font-family", "Cinzel, serif")
      .attr("font-size", "9px")
      .attr("font-weight", "700")
      .style("pointer-events", "none")
      .text((d) => d.chapters.length);

    // ── Events ────────────────────────────────────────────
    // Tooltip state
    let ttHideTimer: ReturnType<typeof setTimeout>;
    const tooltip = document.getElementById("d3-tooltip");

    $nodes
      .on("mouseover", function (event, d) {
        clearTimeout(ttHideTimer);
        d3.select(this).select(".node-ring").transition().duration(180).attr("stroke-opacity", 0.55);
        d3.select(this).select(".node-circle").transition().duration(180).attr("r", 38).attr("fill", d.color + "44");

        if (!tooltip) return;
        const charChapters = chapters.filter((ch) => d.chapters.includes(ch.id));
        const main = containerRef.current!.getBoundingClientRect();
        let x = event.clientX - main.left + 18;
        let y = event.clientY - main.top - 24;
        if (x + 300 > main.width) x = event.clientX - main.left - 310 - 18;
        if (y < 0) y = 8;
        if (y + 280 > main.height) y = main.height - 290;

        tooltip.style.left = x + "px";
        tooltip.style.top = y + "px";
        tooltip.innerHTML = `
          <div class="tt-header">
            <div class="tt-name">${d.name}</div>
            <div class="tt-role">${d.role ?? ""}</div>
            <div class="tt-desc">${d.description}</div>
          </div>
          <div class="tt-body">
            <div class="tt-chapters-label">CHAPTERS (${charChapters.length})</div>
            <div class="chapter-tags">
              ${charChapters.map((ch) => `<span class="chapter-tag" data-chid="${ch.id}">${ch.title}</span>`).join("")}
            </div>
            <div class="tt-hint">${editMode ? "✎ Click node to edit" : "↗ Click a chapter tag to read"}</div>
          </div>`;
        tooltip.classList.add("visible");

        // Attach click handlers to tags
        tooltip.querySelectorAll(".chapter-tag").forEach((el) => {
          el.addEventListener("click", () => {
            const id = (el as HTMLElement).dataset.chid!;
            onTagClick(id);
          });
        });
      })
      .on("mouseout", function (_event, d) {
        d3.select(this).select(".node-ring").transition().duration(280).attr("stroke-opacity", 0);
        d3.select(this)
          .select(".node-circle")
          .transition()
          .duration(280)
          .attr("r", 34)
          .attr("fill", d.color + "22");
        ttHideTimer = setTimeout(() => {
          if (tooltip && !tooltip.matches(":hover")) tooltip.classList.remove("visible");
        }, 220);
      })
      .on("click", (_ev, d) => {
        if (editMode) onNodeClick(d);
      });

    if (tooltip) {
      tooltip.addEventListener("mouseleave", () => {
        clearTimeout(ttHideTimer);
        tooltip.classList.remove("visible");
      });
    }

    // ── Search highlight ────────────────────────────────
    if (searchHighlightIds.length > 0) {
      $nodes.selectAll(".node-circle").attr("opacity", (d: any) => (searchHighlightIds.includes(d.id) ? 1 : 0.2));
      $links.attr("opacity", 0.12);
    } else {
      $nodes.selectAll(".node-circle").attr("opacity", 1);
      $links.attr("opacity", 1);
    }

    // ── Tick ──────────────────────────────────────────────
    simulation.on("tick", () => {
      $links
        .attr("x1", (d: any) => d.source.x)
        .attr("y1", (d: any) => d.source.y)
        .attr("x2", (d: any) => d.target.x)
        .attr("y2", (d: any) => d.target.y);
      $linkLabels
        .attr("x", (d: any) => (d.source.x + d.target.x) / 2)
        .attr("y", (d: any) => (d.source.y + d.target.y) / 2);
      $nodes.attr("transform", (d: any) => `translate(${d.x},${d.y})`);
    });

    return () => {
      simulation.stop();
    };
  }, [characters, chapters, relationships, editMode, searchHighlightIds]);

  return (
    <div ref={containerRef} style={{ width: "100%", height: "100%", position: "relative" }}>
      <svg ref={svgRef} style={{ width: "100%", height: "100%", cursor: "grab", display: "block" }} />
    </div>
  );
}
