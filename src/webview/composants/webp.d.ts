// Les fichiers .webp importés (feu des composants grillés) sont fournis comme
// data URI par le loader esbuild `{ '.webp': 'dataurl' }`.
declare module '*.webp' {
  const url: string;
  export default url;
}
