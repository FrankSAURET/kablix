// Bundle SÉPARÉ pour JSZip (dist/zip.js), chargé au premier projet .projix
// ouvert ou enregistré. JSZip et son moteur de compression pako pèsent 115 Ko :
// gardés hors de dist/extension.js, ce sont 115 Ko de moins à lire et à analyser
// au démarrage de VS Code, alors qu'ils ne servent jamais à l'activation.
// Seul `src/projix.ts` doit l'importer, et uniquement par `await import`.
// Export NOMMÉ (et non `default`) : côté CommonJS, TypeScript synthétise un
// `default` égal au module entier, ce qui ferait retourner le namespace au lieu
// de la classe.
import JSZip from 'jszip';

export { JSZip };
