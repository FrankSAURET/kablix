// Les fichiers .svg importés (dessins de cartes) sont fournis comme texte par
// le loader esbuild `{ '.svg': 'text' }`.
declare module '*.svg' {
  const content: string;
  export default content;
}

// Les .css importés (xterm.css) sont extraits par esbuild dans dist/webview.css
// (import à effet de bord uniquement, aucune valeur).
declare module '*.css';
