import type { NodeStatus, SidebarNode } from "./types.js";

/**
 * Search for nodes that match a search term
 * @param nodes - The array of nodes to search through
 * @param searchTerm - The term to search for
 * @param searchType - The search algorithm to use (depth-first or breadth-first)
 * @returns An array of nodes that match the search term
 */
export const nodesSearch = (
  nodes: SidebarNode[],
  searchTerm: string,
  searchType: "dfs" | "bfs" = "dfs",
): SidebarNode[] => {
  if (!searchTerm.trim()) {
    return [];
  }

  const lowerCaseSearchTerm = searchTerm.toLowerCase();
  const results: SidebarNode[] = [];

  /**
   * Depth-first search implementation
   */
  const dfs = (node: SidebarNode): void => {
    // Check if current node matches search
    if (node.title.toLowerCase().includes(lowerCaseSearchTerm)) {
      results.push(node);
    }

    // Recursively search children if they exist
    if (node.children?.length) {
      for (const child of node.children) {
        dfs(child);
      }
    }
  };

  /**
   * Breadth-first search implementation
   */
  const bfs = (nodes: SidebarNode[]): void => {
    const queue: SidebarNode[] = [...nodes];

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) continue;

      if (current.title.toLowerCase().includes(lowerCaseSearchTerm)) {
        results.push(current);
      }

      if (current.children?.length) {
        queue.push(...current.children);
      }
    }
  };

  // Execute the appropriate search algorithm
  if (searchType === "dfs") {
    for (const node of nodes) {
      dfs(node);
    }
  } else {
    bfs(nodes);
  }

  return results;
};

/**
 * Get a set of node IDs that should be expanded to show nodes up to a specific level
 * @param items - The array of nodes to process
 * @param level - The level to expand to (1-indexed)
 * @returns A Set of node IDs that should be expanded
 */
export const getOpenLevels = (
  items: SidebarNode[],
  level: number,
): Set<string> => {
  if (level < 1) {
    return new Set<string>();
  }

  const result = new Set<string>();

  /**
   * Recursively traverse the node tree and add nodes to the result set
   */
  const traverse = (nodes: SidebarNode[], currentLevel: number): void => {
    for (const node of nodes) {
      if (currentLevel < level) {
        result.add(node.id);
      }
      if (node.children?.length) {
        traverse(node.children, currentLevel + 1);
      }
    }
  };

  traverse(items, 1); // Start from level 1
  return result;
};

/**
 * Check if all nodes up to a specific level are expanded
 * @param items - The array of nodes to check
 * @param expandedNodes - A Set of node IDs that are currently expanded
 * @param level - The level to check (1-indexed)
 * @returns True if all nodes up to the specified level are expanded
 */
export const isOpenLevel = (
  items: SidebarNode[],
  expandedNodes: Set<string>,
  level: number,
): boolean => {
  if (!items.length || level < 1) {
    return false;
  }

  // Check if all levels up to the target level are open
  const queue: SidebarNode[] = [...items];

  for (let i = 0; i < level; i++) {
    const nextLevelQueue: SidebarNode[] = [];

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) continue;

      if (!expandedNodes.has(current.id)) {
        return false;
      }

      if (current.children?.length) {
        nextLevelQueue.push(...current.children);
      }
    }

    queue.push(...nextLevelQueue);
  }

  // Check if there's something open one level deeper
  // If so, then the level is not fully open
  for (const node of queue) {
    if (expandedNodes.has(node.id)) {
      return false;
    }
  }

  return true;
};

/**
 * Find the path from the root to a specific node
 * @param items - The array of nodes to search through
 * @param nodeId - The ID of the node to find
 * @returns An array representing the path to the node, or null if not found
 */
export const getNodePath = (
  items: SidebarNode[],
  nodeId: string,
): Array<SidebarNode> | null => {
  if (!nodeId || !items.length) {
    return null;
  }

  /**
   * Recursively search for the path to a node
   */
  const findPath = (
    node: SidebarNode,
    id: string,
    path: SidebarNode[],
  ): SidebarNode[] | null => {
    // Add the current node to the path
    path.push(node);

    // Check if the current node is the target
    if (node.id === id) {
      return [...path]; // Return a copy to avoid mutation issues
    }

    // Recursively search in the children
    if (node.children?.length) {
      for (const child of node.children) {
        const result = findPath(child, id, [...path]);
        if (result) {
          return result;
        }
      }
    }

    // Not found in this path
    return null;
  };

  // Try to find the path starting from each root node
  for (const root of items) {
    const result = findPath(root, nodeId, []);
    if (result) {
      return result;
    }
  }

  return null;
};

/**
 * Calculate the maximum depth of a tree of nodes
 * @param items - The array of nodes to process
 * @returns The maximum depth of the tree
 */
export const getMaxDepth = (items: SidebarNode[]): number => {
  if (!items.length) {
    return 0;
  }

  let maxDepth = 0;

  /**
   * Recursively traverse the node tree and track the maximum depth
   */
  const traverse = (node: SidebarNode, depth: number): void => {
    // Update maxDepth if the current depth is greater
    maxDepth = Math.max(maxDepth, depth);

    // Traverse children recursively
    if (node.children?.length) {
      for (const child of node.children) {
        traverse(child, depth + 1);
      }
    }
  };

  // Start traversal from each root node
  for (const item of items) {
    traverse(item, 1); // Start with depth 1 for root nodes
  }

  return maxDepth;
};

/**
 * Filter nodes based on their status
 * @param nodes - The array of nodes to filter
 * @param statuses - The array of statuses to include
 * @returns A filtered array of nodes
 */
export const filterStatuses = (
  nodes: SidebarNode[],
  statuses: NodeStatus[],
): SidebarNode[] => {
  if (!nodes.length || !statuses.length) {
    return [];
  }

  return nodes.reduce<SidebarNode[]>((filteredNodes, node) => {
    // Check if the node itself has one of the statuses
    const nodeHasStatus =
      node.status !== undefined && statuses.includes(node.status);

    // Recursively filter children
    const filteredChildren = node.children
      ? filterStatuses(node.children, statuses)
      : [];

    // Include the node if it or any of its children should be included
    if (nodeHasStatus || filteredChildren.length > 0) {
      // Create a copy of the node with filtered children
      const filteredNode: SidebarNode = {
        ...node,
        children: filteredChildren,
      };
      filteredNodes.push(filteredNode);
    }

    return filteredNodes;
  }, []);
};

/**
 * Trigger a custom event
 * @param eventType - The type of event to trigger
 * @param data - The data to include with the event
 * @param element - The element to dispatch the event from
 */
export const triggerEvent = (
  eventType: string,
  data: unknown,
  element: HTMLElement | Document | null = document,
): void => {
  if (!eventType) {
    console.warn("triggerEvent called without an event type");
    return;
  }

  const event = new CustomEvent(eventType, {
    detail: data,
    bubbles: true,
    cancelable: false,
  });

  (element || document).dispatchEvent(event);
};
