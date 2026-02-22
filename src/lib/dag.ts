/**
 * Kahn's algorithm for topological sort with cycle detection.
 *
 * @param nodes - List of node IDs
 * @param edges - Map of node ID to its dependency IDs (depends_on)
 * @returns Topologically sorted array of node IDs
 * @throws Error if circular dependency detected or unknown node referenced
 */
export function topologicalSort(nodes: string[], edges: Map<string, string[]>): string[] {
  const nodeSet = new Set(nodes);

  // Validate all referenced nodes exist
  for (const [node, deps] of edges) {
    for (const dep of deps) {
      if (!nodeSet.has(dep)) {
        throw new Error(`Dependency "${dep}" referenced by "${node}" does not exist`);
      }
    }
  }

  // Build in-degree map and adjacency list (forward edges)
  const inDegree = new Map<string, number>();
  const forward = new Map<string, string[]>();

  for (const node of nodes) {
    inDegree.set(node, 0);
    forward.set(node, []);
  }

  for (const [node, deps] of edges) {
    for (const dep of deps) {
      inDegree.set(node, (inDegree.get(node) ?? 0) + 1);
      forward.get(dep)?.push(node);
    }
  }

  // Start with nodes that have no incoming edges
  const queue: string[] = [];
  for (const [node, degree] of inDegree) {
    if (degree === 0) {
      queue.push(node);
    }
  }

  const sorted: string[] = [];

  while (queue.length > 0) {
    const node = queue.shift()!;
    sorted.push(node);

    for (const neighbor of forward.get(node) ?? []) {
      const newDegree = inDegree.get(neighbor)! - 1;
      inDegree.set(neighbor, newDegree);
      if (newDegree === 0) {
        queue.push(neighbor);
      }
    }
  }

  if (sorted.length !== nodes.length) {
    throw new Error("Circular dependency detected in workflow DAG");
  }

  return sorted;
}
