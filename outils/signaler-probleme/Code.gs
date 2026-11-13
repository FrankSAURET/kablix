// Réception des rapports « Kablix : Signaler un problème ».
//
// Google Apps Script déployé en « Application Web » (exécuter en tant que : moi,
// accès : tout le monde). Kablix poste un JSON { version, reference, resume,
// zip (base64) } ; le script renvoie un mail AU PROPRIÉTAIRE du script, zip en
// pièce jointe. Aucune adresse n'est écrite ici ni dans l'extension : le
// destinataire est le compte qui a déployé le script.
//
// Garde-fous : taille du zip bornée, 30 rapports par heure au plus.

var MAX_ZIP = 18 * 1024 * 1024;
var MAX_PAR_HEURE = 30;

function repondre(objet) {
  return ContentService.createTextOutput(JSON.stringify(objet)).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    var corps = JSON.parse(e.postData.contents);
    if (!corps || typeof corps.zip !== 'string') return repondre({ ok: false, erreur: 'rapport vide' });

    // Plafond horaire : compteur dans le cache du script (expire tout seul).
    var cache = CacheService.getScriptCache();
    var cle = 'rapports-' + Math.floor(Date.now() / 3600000);
    var compte = Number(cache.get(cle) || 0);
    if (compte >= MAX_PAR_HEURE) return repondre({ ok: false, erreur: 'trop de rapports, réessayez dans une heure' });
    cache.put(cle, String(compte + 1), 3700);

    var octets = Utilities.base64Decode(corps.zip);
    if (octets.length > MAX_ZIP) return repondre({ ok: false, erreur: 'rapport trop gros' });

    var version = String(corps.version || '?').replace(/[^0-9.]/g, '').slice(0, 20) || '?';
    var reference = String(corps.reference || '').replace(/[^0-9a-f]/gi, '').slice(0, 16);
    var resume = String(corps.resume || '').replace(/[\r\n]+/g, ' ').slice(0, 80);
    var nom = 'rapport-kablix-' + version + '-' + (reference || 'sans-ref') + '.zip';
    var pj = Utilities.newBlob(octets, 'application/zip', nom);

    // Pièce jointe acceptée seulement si c'est un VRAI rapport Kablix : un zip
    // qui contient rapport.txt, et rien d'exécutable. Un inconnu qui posterait
    // n'importe quoi à l'URL ne fait pas passer un fichier piégé dans la boîte.
    var contenu;
    try {
      contenu = Utilities.unzip(pj);
    } catch (errZip) {
      return repondre({ ok: false, erreur: 'pas un rapport Kablix' });
    }
    var noms = contenu.map(function (b) { return b.getName(); });
    if (noms.indexOf('rapport.txt') < 0) return repondre({ ok: false, erreur: 'pas un rapport Kablix' });
    var interdit = /\.(exe|dll|bat|cmd|com|scr|ps1|vbs|js|jse|wsf|msi|lnk|hta|jar|zip|7z|rar)$/i;
    if (noms.some(function (n) { return interdit.test(n); })) return repondre({ ok: false, erreur: 'contenu refusé' });

    MailApp.sendEmail({
      to: Session.getEffectiveUser().getEmail(),
      subject: '[Kablix ' + version + '] ' + (resume || 'problème signalé'),
      body:
        'Rapport « Signaler un problème » reçu de Kablix ' + version + '.\n' +
        'Référence : ' + reference + '\n\n' +
        'Description, journaux anonymisés et projet éventuel : voir la pièce jointe (rapport.txt en tête).',
      attachments: [pj],
      name: 'Kablix',
    });
    return repondre({ ok: true, reference: reference });
  } catch (err) {
    return repondre({ ok: false, erreur: String(err && err.message ? err.message : err).slice(0, 200) });
  }
}

// Simple vérification depuis un navigateur : l'URL répond « Kablix : prêt ».
function doGet() {
  return ContentService.createTextOutput('Kablix : prêt');
}
