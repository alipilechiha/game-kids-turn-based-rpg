import { findPath } from 'waypoint-rpg-core';
import type { Anchor, GraphSource } from 'waypoint-rpg-core';

const start: Anchor = {
  id: 'anchor-start',
  x: 0,
  z: 0,
  walkable: true,
  areaId: 'area-demo',
  mapId: 'map-demo',
  npcId: null,
  landmarkId: null,
};
const finish: Anchor = { ...start, id: 'anchor-finish', x: 2 };
const source: GraphSource = {
  anchors: [start, finish],
  edges: [{ from: start.id, to: finish.id }],
};

const output = document.querySelector<HTMLOutputElement>('#path');
if (!output) throw new Error('Missing path output');
output.value = findPath(source, start.id, finish.id).join(',');
