import { describe, expect, it } from "vitest";
import { topologicalSort } from "../../src/lib/dag.js";

describe("topologicalSort", () => {
  it("should sort a linear DAG (A → B → C)", () => {
    const nodes = ["A", "B", "C"];
    const edges = new Map([
      ["B", ["A"]],
      ["C", ["B"]],
    ]);
    const result = topologicalSort(nodes, edges);
    expect(result).toEqual(["A", "B", "C"]);
  });

  it("should sort a branching DAG (A → C, B → C)", () => {
    const nodes = ["A", "B", "C"];
    const edges = new Map([["C", ["A", "B"]]]);
    const result = topologicalSort(nodes, edges);
    expect(result.indexOf("A")).toBeLessThan(result.indexOf("C"));
    expect(result.indexOf("B")).toBeLessThan(result.indexOf("C"));
    expect(result).toHaveLength(3);
  });

  it("should return a single node as-is", () => {
    const nodes = ["A"];
    const edges = new Map<string, string[]>();
    const result = topologicalSort(nodes, edges);
    expect(result).toEqual(["A"]);
  });

  it("should sort a diamond DAG (A → B, A → C, B → D, C → D)", () => {
    const nodes = ["A", "B", "C", "D"];
    const edges = new Map([
      ["B", ["A"]],
      ["C", ["A"]],
      ["D", ["B", "C"]],
    ]);
    const result = topologicalSort(nodes, edges);
    expect(result[0]).toBe("A");
    expect(result[result.length - 1]).toBe("D");
    expect(result.indexOf("B")).toBeLessThan(result.indexOf("D"));
    expect(result.indexOf("C")).toBeLessThan(result.indexOf("D"));
  });

  it("should throw on circular dependency (A → B → C → A)", () => {
    const nodes = ["A", "B", "C"];
    const edges = new Map([
      ["B", ["A"]],
      ["C", ["B"]],
      ["A", ["C"]],
    ]);
    expect(() => topologicalSort(nodes, edges)).toThrow(/circular/i);
  });

  it("should throw on self-referencing node", () => {
    const nodes = ["A"];
    const edges = new Map([["A", ["A"]]]);
    expect(() => topologicalSort(nodes, edges)).toThrow(/circular/i);
  });

  it("should throw when depends_on references non-existent node", () => {
    const nodes = ["A", "B"];
    const edges = new Map([["B", ["X"]]]);
    expect(() => topologicalSort(nodes, edges)).toThrow(/not found|unknown|does not exist/i);
  });

  it("should handle nodes with no dependencies", () => {
    const nodes = ["A", "B", "C"];
    const edges = new Map<string, string[]>();
    const result = topologicalSort(nodes, edges);
    expect(result).toHaveLength(3);
    expect(result).toContain("A");
    expect(result).toContain("B");
    expect(result).toContain("C");
  });
});
