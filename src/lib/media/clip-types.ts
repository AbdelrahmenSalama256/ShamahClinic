/** The clip extensions `clip.ts` writes, and the type each one is served as. Kept free of the database so `serve.ts` can read it. */
export const CLIP_CONTENT_TYPES: ReadonlyMap<string, string> = new Map([
  ['.mp3', 'audio/mpeg'],
  ['.m4a', 'audio/mp4'],
  ['.ogg', 'audio/ogg'],
  ['.wav', 'audio/wav'],
  ['.weba', 'audio/webm'],
  ['.mp4', 'video/mp4'],
  ['.mov', 'video/quicktime'],
  ['.webm', 'video/webm'],
]);
