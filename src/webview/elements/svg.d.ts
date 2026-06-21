// Les fichiers .svg importés (dessins de cartes) sont fournis comme texte par
// le loader esbuild `{ '.svg': 'text' }`.
declare module '*.svg' {
  const content: string;
  export default content;
}
