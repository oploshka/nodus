// DependencyIndexer.ts

import type { ProjectIndex } from '@knowledge/Index/ProjectIndex';
import { DependencyGraph } from '@knowledge/Dependency/DependencyGraph';

export class DependencyIndexer {
  build(index: ProjectIndex): DependencyGraph {
    const graph = new DependencyGraph();

    for (const file of index.files) {
      graph.add(file.path, file.path);
    }

    return graph;
  }
}