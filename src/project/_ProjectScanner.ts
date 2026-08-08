// // ProjectScanner.ts
//
// import { FileSystemTool } from '@tool/FileSystem/FileSystemTool';
// import type { Project } from '@project/Project';
//
// export class _ProjectScanner {
//   constructor(private readonly filesystem: FileSystemTool) {}
//
//   async scan(path: string): Promise<Project> {
//     const files = await this.filesystem.list(path);
//
//     return {
//       path,
//       name: path.split('/').pop() ?? path,
//       files,
//     };
//   }
// }