import type { NodeStatus, SidebarNode } from "./types";

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
    if (node.children?.length) {
      for (const child of node.children) {
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
        if (current.children?.length) {
          queue.push(...current.children);
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
): Set<string> => {
  const result = new Set<string>();

  function traverse(nodes: SidebarNode[], currentLevel: number) {
    for (const node of nodes) {
      if (currentLevel < level) {
        result.add(node.id);
      }
      if (node.children) {
        traverse(node.children, currentLevel + 1);
      }
    }
  }

  traverse(items, 1); // Start from level 1
  return result;
};

export const isOpenLevel = (
  items: SidebarNode[],
  expandedNodes: Set<string>,
  level: number,
): boolean => {
  // it is open if all levels up to the target level are open
  const queue: SidebarNode[] = [...items];
  for (let i = 0; i < level; i++) {
    const nextLevelQueue: SidebarNode[] = [];
    while (queue.length > 0) {
      const current = queue.shift();
      if (current && !expandedNodes.has(current.id)) {
        return false;
      } else if (current?.children) {
        nextLevelQueue.push(...current.children);
      }
    }
    queue.push(...nextLevelQueue);
  }

  // now we check if there's something open one level deeper, if so, then it is not open
  // the following level is now in the queue (unless it is the last level)
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
    if (node.children) {
      for (const child of node.children) {
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

export const getMaxDepth = (items: SidebarNode[]): number => {
  let maxDepth = 0;

  function traverse(node: SidebarNode, depth: number) {
    // Update maxDepth if the current depth is greater
    if (depth > maxDepth) {
      maxDepth = depth;
    }

    // Traverse children recursively
    if (node.children) {
      for (const child of node.children) {
        traverse(child, depth + 1);
      }
    }
  }

  // Start traversal from the root of each item
  for (const item of items) {
    traverse(item, 1); // Start with depth 1 for the root node
  }

  return maxDepth;
};

export const filterStatuses = (
  nodes: SidebarNode[],
  statuses: NodeStatus[],
): SidebarNode[] => {
  return nodes.reduce<SidebarNode[]>((filteredNodes, node) => {
    // Check if the node itself or any of its children have one of the statuses
    const shouldIncludeNode =
      node.status !== undefined && statuses.includes(node.status);

    // Recursively filter children
    const filteredChildren = node.children
      ? filterStatuses(node.children, statuses)
      : [];

    // Include the node if it or any of its children should be included
    if (shouldIncludeNode || filteredChildren.length > 0) {
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

// event listener
export const triggerEvent = (
  eventType: string,
  data: unknown,
  element: HTMLElement | Document | null = document,
) => {
  const event = new CustomEvent(eventType, {
    detail: data,
    bubbles: true,
    cancelable: false,
  });
  if (!element) element = document;
  element.dispatchEvent(event);
};
