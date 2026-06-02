import naturalCompare from "natural-compare-lite";
import type {
  NodeSortOrder,
  NodeSortType,
  NodeStatus,
  SidebarNode,
} from "./types.js";

export const nodesSearch = (
  nodes: SidebarNode[],
  searchTerm: string,
  searchType: "bfs" | "dfs" = "dfs",
): SidebarNode[] => {
  if (!searchTerm.trim()) {
    return [];
  }

  const lowerCaseSearchTerm = searchTerm.toLowerCase();
  const results: SidebarNode[] = [];

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

export const getOpenLevels = (
  items: SidebarNode[],
  level: number,
): Set<string> => {
  if (level < 1) {
    return new Set<string>();
  }

  const result = new Set<string>();

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

export const getNodePath = (
  items: SidebarNode[],
  nodeId: string,
): SidebarNode[] | null => {
  if (!nodeId || !items.length) {
    return null;
  }

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

export const getMaxDepth = (items: SidebarNode[]): number => {
  if (!items.length) {
    return 0;
  }

  let maxDepth = 0;

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

export const triggerEvent = (
  eventType: string,
  data: unknown,
  element: Document | HTMLElement | null = document,
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

  (element ?? document).dispatchEvent(event);
};

export const sortNodes = (
  nodes: SidebarNode[],
  sortType: NodeSortType,
  sortOrder: NodeSortOrder,
): SidebarNode[] => {
  const sortedNodes = [...nodes].sort((a, b) => {
    const comparison =
      typeof sortType === "function"
        ? sortType(a.title, b.title)
        : sortType === "alphabetical"
          ? a.title.toLowerCase().localeCompare(b.title.toLowerCase())
          : naturalCompare(a.title, b.title);

    return sortOrder === "desc" ? -comparison : comparison;
  });

  return sortedNodes.map((node) => ({
    ...node,
    children: node.children
      ? sortNodes(node.children, sortType, sortOrder)
      : undefined,
  }));
};
