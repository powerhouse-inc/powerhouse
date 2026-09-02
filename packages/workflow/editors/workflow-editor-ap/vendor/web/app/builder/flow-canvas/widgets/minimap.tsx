// ph-stub: upstream draws piece logos into the minimap; this renders the
// plain react-flow minimap when enabled.
import { MiniMap } from '@xyflow/react';

import { useBuilderStateContext } from '../../builder-hooks.js';

const Minimap = () => {
  const showMinimap = useBuilderStateContext((state) => state.showMinimap);
  if (!showMinimap) return null;
  return <MiniMap pannable zoomable position="bottom-left" />;
};

export default Minimap;
