#!/usr/bin/env node
// README roadmap is generated from the phase/status/evidence table in
// docs/FRAMEWORK-ROADMAP.md. Never infer completion from a merge alone.
import { readFileSync, writeFileSync } from "node:fs";

const roadmapPath = "docs/FRAMEWORK-ROADMAP.md";
const readmePath = "README.md";
const begin = "<!-- framework-roadmap:begin -->";
const end = "<!-- framework-roadmap:end -->";
const allowed = new Set(["Complete", "In progress", "Next", "Planned", "Blocked"]);
const symbols = {
  Complete: "✅ Complete",
  "In progress": "🚧 In progress",
  Next: "➡️ Next",
  Planned: "⏳ Planned",
  Blocked: "⛔ Blocked",
};

function extractPhases(markdown) {
  const heading = markdown.indexOf("### Roadmap and gates");
  if (heading < 0) throw new Error("Missing ### Roadmap and gates heading");
  const lines = markdown.slice(heading).split(/\r?\n/);
  const header = lines.findIndex((line) =>
    /^\|\s*Phase\s*\|\s*Status\s*\|/.test(line) &&
    line.includes("| Evidence"),
  );
  if (header < 0) throw new Error("Roadmap table must include Phase, Status and Evidence");
  const phases = [];
  for (let i = header + 2; i < lines.length && /^\s*\|/.test(lines[i]); i++) {
    const cells = lines[i].split("|").slice(1, -1).map((cell) => cell.trim());
    if (cells.length !== 5) throw new Error("Expected five roadmap columns at row " + i);
    const match = /^(\d+)\.\s+(.+)$/.exec(cells[0]);
    if (!match) throw new Error("Invalid roadmap phase identifier: " + cells[0]);
    const number = Number(match[1]);
    if (number !== phases.length + 1) {
      throw new Error("Roadmap phases must be sequential, starting at 1");
    }
    if (!allowed.has(cells[1])) {
      throw new Error("Unsupported roadmap status for phase " + number + ": " + cells[1]);
    }
    if (!cells[2] || !cells[3]) throw new Error("Missing phase description or exit gate");
    phases.push({ number, title: match[2], status: cells[1], evidence: cells[4] });
  }
  if (!phases.length) throw new Error("No roadmap phases found");
  if (phases.filter((phase) => phase.status === "Next").length > 1) {
    throw new Error("Only one phase may be marked Next");
  }
  return phases;
}

function renderRoadmap(phases) {
  const completed = phases.filter((phase) => phase.status === "Complete");
  const upcoming = phases.find((phase) => phase.status === "In progress") ||
    phases.find((phase) => phase.status === "Next") ||
    phases.find((phase) => phase.status === "Planned");
  const summary = "**" + completed.length + "/" + phases.length +
    " phases completed**" + (upcoming ? " · Next: **Phase " +
    upcoming.number + " — " + upcoming.title + "**" : "");
  const diagram = [
    "flowchart LR",
    "  " + phases.map((phase) =>
      "P" + phase.number + "[\"" + phase.number + ". " +
      phase.title.replace(/["<>]/g, "") + "\"]",
    ).join(" --> "),
    "  classDef complete fill:#dcfce7,stroke:#15803d,color:#14532d",
    "  classDef next fill:#fef3c7,stroke:#b45309,color:#78350f",
    "  classDef planned fill:#e5e7eb,stroke:#6b7280,color:#1f2937",
  ];
  for (const [status, css] of [
    ["Complete", "complete"],
    ["In progress", "next"],
    ["Next", "next"],
    ["Planned", "planned"],
    ["Blocked", "planned"],
  ]) {
    const matching = phases.filter((phase) => phase.status === status)
      .map((phase) => "P" + phase.number);
    if (matching.length) diagram.push("  class " + matching.join(",") + " " + css);
  }
  const rows = phases.map((phase) =>
    "| " + phase.number + ". " + phase.title + " | " +
    symbols[phase.status] + " | " + (phase.evidence || "—") + " |",
  );
  return [
    begin,
    "<!-- prettier-ignore-start -->",
    "",
    "## Framework roadmap",
    "",
    summary + " · [Full roadmap and exit gates](" + roadmapPath + ")",
    "",
    "```mermaid",
    ...diagram,
    "```",
    "",
    "| Phase | Status | Evidence |",
    "| --- | --- | --- |",
    ...rows,
    "",
    "_Generated from the canonical roadmap. Update status and evidence in " +
      "[docs/FRAMEWORK-ROADMAP.md](" + roadmapPath + "), then run " +
      "npm run roadmap:sync._",
    "",
    "<!-- prettier-ignore-end -->",
    end,
  ].join("\n");
}

function updateReadme(readme, generated) {
  const start = readme.indexOf(begin);
  const finish = readme.indexOf(end);
  if ((start >= 0) !== (finish >= 0)) {
    throw new Error("README has unmatched generated roadmap markers");
  }
  if (start >= 0) {
    if (finish < start) throw new Error("Invalid generated roadmap marker order");
    return readme.slice(0, start) + generated + readme.slice(finish + end.length);
  }
  const anchor = "\n## Requirements\n";
  const pos = readme.indexOf(anchor);
  if (pos < 0) throw new Error("README missing ## Requirements insertion anchor");
  return readme.slice(0, pos) + "\n" + generated + "\n" + readme.slice(pos);
}

const args = process.argv.slice(2);
if (args.some((arg) => arg !== "--check")) {
  throw new Error("Usage: node scripts/sync-framework-roadmap.mjs [--check]");
}
const phases = extractPhases(readFileSync(roadmapPath, "utf8"));
const existing = readFileSync(readmePath, "utf8");
const updated = updateReadme(existing, renderRoadmap(phases));
if (updated !== existing) {
  if (args.includes("--check")) {
    console.error("README roadmap is stale. Run npm run roadmap:sync and commit README.md.");
    process.exitCode = 1;
  } else {
    writeFileSync(readmePath, updated, "utf8");
    console.log("Updated README roadmap (" + phases.length + " phases).");
  }
} else {
  console.log("README roadmap is up to date.");
}
