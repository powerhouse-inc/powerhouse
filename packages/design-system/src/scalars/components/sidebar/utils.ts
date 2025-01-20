import type { SidebarNode } from "./types";

export const nodesSearch = (
  nodes: SidebarNode[],
  searchTerm: string,
  searchType: "dfs" | "bfs" = "dfs",
): SidebarNode[] => {
  const lowerCaseSearchTerm = searchTerm.toLowerCase();
  const results: SidebarNode[] = [];

  const dfs = (node: SidebarNode) => {
    // Check if current node matches search
    if (node.title.toLowerCase().includes(lowerCaseSearchTerm)) {
      results.push(node);
    }

    // Recursively search children if they exist
    if (node.childrens?.length) {
      for (const child of node.childrens) {
        dfs(child);
      }
    }
  };

  const bfs = (node: SidebarNode | SidebarNode[]) => {
    const queue: SidebarNode[] = Array.isArray(node) ? [...node] : [node];
    while (queue.length > 0) {
      const current = queue.shift();
      if (current) {
        if (current.title.toLowerCase().includes(lowerCaseSearchTerm)) {
          results.push(current);
        }
        if (current.childrens?.length) {
          queue.push(...current.childrens);
        }
      }
    }
  };

  if (searchType === "dfs") {
    for (const node of nodes) {
      dfs(node);
    }
  } else {
    bfs(nodes);
  }

  return results;
};

export const getOpenLevels = (
  items: SidebarNode[],
  level: number,
): Record<string, boolean> => {
  const result: Record<string, boolean> = {};

  function traverse(nodes: SidebarNode[], currentLevel: number) {
    for (const node of nodes) {
      if (currentLevel <= level) {
        result[node.id] = true;
      }
      if (node.childrens) {
        traverse(node.childrens, currentLevel + 1);
      }
    }
  }

  traverse(items, 1); // Start from level 1
  return result;
};

export const getNodePath = (
  items: SidebarNode[],
  nodeId: string,
): Array<SidebarNode> | null => {
  // Helper function to recursively search for the path in a single node
  function findPath(
    node: SidebarNode,
    id: string,
    path: SidebarNode[],
  ): SidebarNode[] | null {
    // Add the current node to the path
    path.push(node);

    // Check if the current node is the target
    if (node.id === id) {
      return path;
    }

    // Recursively search in the children
    if (node.childrens) {
      for (const child of node.childrens) {
        const result = findPath(child, id, path);
        if (result) {
          return result;
        }
      }
    }

    // Backtrack if not found in this path
    path.pop();
    return null;
  }

  // Iterate through each node in the array of nodes
  for (const root of items) {
    const result = findPath(root, nodeId, []);
    if (result) {
      return result; // Return as soon as a path is found
    }
  }

  // Return an empty array if no path is found
  return null;
};
