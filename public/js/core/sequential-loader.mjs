// Resolve legacy scripts from their declared prerequisites instead of relying
// on source order. They still execute serially because classic scripts share names.
export function orderByDependencies(entries) {
  const byId = new Map();
  for (const entry of entries) {
    if (!entry?.id || byId.has(entry.id)) throw new Error(`Invalid or duplicate client module: ${entry?.id || "(missing id)"}`);
    byId.set(entry.id, entry);
  }

  const state = new Map();
  const ordered = [];
  function visit(entry, stack = []) {
    const status = state.get(entry.id) || 0;
    if (status === 2) return;
    if (status === 1) throw new Error(`Client module dependency cycle: ${[...stack, entry.id].join(" -> ")}`);
    state.set(entry.id, 1);
    for (const dependencyId of entry.dependsOn || []) {
      const dependency = byId.get(dependencyId);
      if (!dependency) throw new Error(`Unknown client dependency ${dependencyId} required by ${entry.id}`);
      visit(dependency, [...stack, entry.id]);
    }
    state.set(entry.id, 2);
    ordered.push(entry);
  }

  for (const entry of entries) visit(entry);
  return ordered;
}

// Rejecting one entry stops the chain before any dependent script is requested.
export async function loadSequentially(entries, loadEntry) {
  for (const entry of orderByDependencies(entries)) await loadEntry(entry);
}
