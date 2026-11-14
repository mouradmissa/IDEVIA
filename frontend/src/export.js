export function toMarkdown(idea, d) {
  const L = [`# ${d.mindmap?.center || "Projet"}`, `> ${idea}`, "", "## Mind map"];
  d.mindmap?.branches.forEach((b) => L.push(`- **${b.name}** : ${(b.children || []).join(", ")}`));
  L.push("", "## Fonctionnalités");
  d.features.forEach((f) => L.push(`- [${f.priority}] **${f.name}** : ${f.desc}`));
  L.push("", "## Acteurs");
  d.actors.forEach((a) => L.push(`- **${a.name}** : ${a.role}`));
  L.push("", "## User stories");
  d.stories.forEach((s, i) => L.push(`${i + 1}. En tant que ${s.actor}, je veux ${s.want} afin de ${s.so}.`));
  L.push("", "## UML (classes)", "```mermaid", "classDiagram");
  d.classes.forEach((c) => {
    L.push(`  class ${c.name.replace(/\W/g, "")} {`);
    (c.attrs || []).forEach((a) => L.push(`    +${a}`));
    (c.methods || []).forEach((m) => L.push(`    +${m}`));
    L.push("  }");
  });
  L.push("```", "", "## Base de données");
  d.tables.forEach((t) => {
    L.push(`### ${t.name}`);
    t.cols.forEach((c) => L.push(`- ${c.k ? c.k + " " : ""}${c.n} : ${c.t}`));
  });
  if (d.v0Prompt) L.push("", "## Prompt v0", d.v0Prompt);
  if (d.gammaPrompt) L.push("", "## Brief Gamma", d.gammaPrompt);
  L.push("", "## Backlog");
  d.backlog.forEach((b) => L.push(`- Sprint ${b.sprint} · ${b.title} (${b.points} pts)`));
  return L.join("\n");
}
export function downloadBlob(name, blob) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}
export function download(name, text, type = "text/plain") {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}
