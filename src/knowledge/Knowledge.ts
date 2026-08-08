// Knowledge.ts

import type { DependencyGraph } from '@knowledge/Dependency/DependencyGraph';
import type { ProjectIndex } from '@knowledge/Index/ProjectIndex';
import type { Rag } from '@knowledge/Rag/Rag';

export interface Knowledge {
  index: ProjectIndex;
  dependencies: DependencyGraph;
  rag: Rag;
}