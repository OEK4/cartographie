/* Comptes Plateforme CET · HMIMV — Google Apps Script (gratuit).
   Déploiement : Extensions ▸ Apps Script dans une feuille Google vide ▸ coller ▸ Déployer ▸ Application web
   (Exécuter en tant que : moi · Accès : tout le monde) ▸ copier l'URL dans app.html (API_COMPTES).
   Feuilles créées seules : « comptes » (email | nom | hash | role | photo | code | codeDate | cree | statut)
   et « demandes » (registre de contrôle des adresses externes : email | nom | date | statut).
   Valider un compte externe : dans « comptes », colonne statut, remplacer « attente » par « ok ». */
var DOMAINES = ['bymaro.ma', 'bouygues-construction.com'];   // adresses de l'organisation : accès immédiat. Les autres sont inscrites dans « demandes » et attendent la validation d'un admin.
var ADMINS = ['o.elkojji@bouygues-construction.com', 's.hariri@bouygues-construction.com', 'i.i.ibnoujabeldhel@bouygues-construction.com'];   // administrateurs (modification du Suivi CET)
var PROPRIETAIRE = 'o.elkojji@bouygues-construction.com';   // seul à accéder à comptes.html (gestion des comptes)
var VALIDITE_CODE_MIN = 15;

function feuille() {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), f = ss.getSheetByName('comptes');
  if (!f) { f = ss.insertSheet('comptes'); f.appendRow(['email', 'nom', 'hash', 'role', 'photo', 'code', 'codeDate', 'cree', 'statut', 'vu', 'page']); }
  else if (f.getRange(1, 10).getValue() !== 'vu') f.getRange(1, 10, 1, 2).setValues([['vu', 'page']]);
  return f;
}
function demandes() {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), f = ss.getSheetByName('demandes');
  if (!f) { f = ss.insertSheet('demandes'); f.appendRow(['email', 'nom', 'date', 'statut']); }
  return f;
}
/* Temps d'utilisation : 1 signal / minute d'onglet visible = 1 minute, agrégé par jour · personne · interface */
function activite() {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), f = ss.getSheetByName('activite');
  if (!f) { f = ss.insertSheet('activite'); f.appendRow(['jour', 'email', 'nom', 'interface', 'minutes', 'sessions', 'derniere']); f.setFrozenRows(1); }
  return f;
}
function compter(u, page, maintenant) {
  var jour = Utilities.formatDate(maintenant, 'Africa/Casablanca', 'yyyy-MM-dd'), cle = jour + '|' + String(u.email).toLowerCase() + '|' + page;
  var cache = CacheService.getScriptCache(), a = activite(), row = Number(cache.get('r:' + cle) || 0);
  if (!row || String(a.getRange(row, 1).getDisplayValue()) + '|' + String(a.getRange(row, 2).getValue()).toLowerCase() + '|' + a.getRange(row, 4).getValue() !== cle) {
    row = 0; var n = a.getLastRow();
    if (n > 1) { var v = a.getRange(Math.max(2, n - 400), 1, Math.min(n - 1, 401), 4).getDisplayValues(), base = Math.max(2, n - 400);
      for (var i = v.length - 1; i >= 0; i--) if (v[i][0] + '|' + String(v[i][1]).toLowerCase() + '|' + v[i][3] === cle) { row = base + i; break; } }
    if (!row) { a.appendRow([jour, u.email, u.nom, page, 0, 0, maintenant]); row = a.getLastRow(); a.getRange(row, 1).setNumberFormat('@'); a.getRange(row, 1).setValue(jour); }
    cache.put('r:' + cle, String(row), 21600);
  }
  var prec = a.getRange(row, 7).getValue(), nouvelle = !prec || (maintenant - new Date(prec)) > 5 * 60000;
  a.getRange(row, 5, 1, 3).setValues([[Number(a.getRange(row, 5).getValue() || 0) + 1, Number(a.getRange(row, 6).getValue() || 0) + (nouvelle ? 1 : 0), maintenant]]);
}
function lire(email) {
  var f = feuille(), v = f.getDataRange().getValues();
  for (var i = 1; i < v.length; i++) if (String(v[i][0]).toLowerCase() === email) return { row: i + 1, email: v[i][0], nom: v[i][1], hash: v[i][2], role: v[i][3], photo: v[i][4], code: String(v[i][5]), codeDate: v[i][6], statut: String(v[i][8] || 'ok') };
  return null;
}
/* Propriétaire : seul à gérer les comptes (comptes.html) = PROPRIETAIRE ci-dessus. */
function proprio() { return String(PROPRIETAIRE || PropertiesService.getScriptProperties().getProperty('PROPRIETAIRE') || '').toLowerCase(); }
function estProprio(u) { return !!u && String(u.email).toLowerCase() === proprio(); }
function estAdmin(u) { return !!u && (u.role === 'admin' || ADMINS.indexOf(String(u.email).toLowerCase()) >= 0); }
function aucunAdmin() { var v = feuille().getDataRange().getValues(); for (var i = 1; i < v.length; i++) if (v[i][2] && v[i][3] === 'admin') return false; return ADMINS.length === 0; }
function admins() { var v = feuille().getDataRange().getValues(), o = []; for (var i = 1; i < v.length; i++) if (v[i][2] && v[i][3] === 'admin' && String(v[i][8] || 'ok') === 'ok') o.push(v[i][0]); return o.concat(ADMINS); }
function sha(s) { return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8).map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join(''); }
function domaineOk(email) { var d = email.split('@')[1] || ''; return DOMAINES.indexOf('') >= 0 || DOMAINES.indexOf(d) >= 0; }
function rep(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

function doPost(e) {
  var o = {}; try { o = JSON.parse(e.postData.contents || '{}'); } catch (x) {}
  var email = String(o.email || '').trim().toLowerCase(), u = email ? lire(email) : null, f = feuille();
  if (!email || email.indexOf('@') < 0) return rep({ ok: false, msg: 'Adresse e-mail invalide.' });
  switch (o.a) {
    case 'etat': return rep({ ok: true, existe: !!(u && u.hash), nom: u ? u.nom : '' });
    case 'code': {
      var code = String(Math.floor(100000 + Math.random() * 900000));
      if (u) { f.getRange(u.row, 6, 1, 2).setValues([[code, new Date()]]); }
      else f.appendRow([email, '', '', ADMINS.indexOf(email) >= 0 ? 'admin' : 'user', '', code, new Date(), '', domaineOk(email) ? 'ok' : 'attente']);
      MailApp.sendEmail({ to: email, subject: 'Plateforme CET · HMIMV — code de vérification ' + code,
        htmlBody: '<div style="font-family:Arial,sans-serif;max-width:480px"><h2 style="margin:0 0 8px">Plateforme CET · HMIMV</h2><p>Votre code de vérification :</p><div style="font-size:32px;font-weight:800;letter-spacing:8px;padding:14px 18px;background:#F2F1ED;border-radius:10px;display:inline-block">' + code + '</div><p style="color:#6B675F">Valable ' + VALIDITE_CODE_MIN + ' minutes. Si vous n’êtes pas à l’origine de cette demande, ignorez ce message.</p></div>' });
      return rep({ ok: true });
    }
    case 'creer': {
      if (!u || u.code !== String(o.code)) return rep({ ok: false, msg: 'Code de vérification incorrect.' });
      if ((new Date() - new Date(u.codeDate)) > VALIDITE_CODE_MIN * 60000) return rep({ ok: false, msg: 'Code expiré : demandez-en un nouveau.' });
      if (!o.mdp || !o.nom) return rep({ ok: false, msg: 'Nom et mot de passe requis.' });
      var premier = !u.hash && !proprio() && aucunAdmin();
      if (premier) PropertiesService.getScriptProperties().setProperty('PROPRIETAIRE', email);
      var role = (premier || ADMINS.indexOf(email) >= 0) ? 'admin' : (u.role || 'user');
      var attente = !premier && !domaineOk(email) && ADMINS.indexOf(email) < 0 && u.statut !== 'ok';
      f.getRange(u.row, 2, 1, 8).setValues([[o.nom, sha(o.mdp), role, u.photo || '', '', '', u.hash ? (f.getRange(u.row, 8).getValue() || new Date()) : new Date(), attente ? 'attente' : 'ok']]);
      if (attente) {
        demandes().appendRow([email, o.nom, new Date(), 'à valider']);
        var ad = admins(); if (ad.length) MailApp.sendEmail({ to: ad.join(','), subject: 'Plateforme CET · demande d’accès : ' + email, htmlBody: '<p><b>' + o.nom + '</b> (' + email + ') demande l’accès à la plateforme (adresse hors organisation).</p><p>Pour répondre : ouvrez <b>https://oek4.github.io/cartographie/comptes.html</b> ▸ En attente ▸ Valider ou Refuser.</p>' });
      }
      return rep({ ok: true, nom: o.nom, role: role, attente: attente });
    }
    case 'connexion': {
      if (!u || !u.hash) return rep({ ok: false, msg: 'Compte inexistant : créez-le avec votre adresse.' });
      if (u.hash !== sha(String(o.mdp))) return rep({ ok: false, msg: 'Mot de passe incorrect.' });
      if (u.statut === 'attente') return rep({ ok: false, msg: 'Compte en attente de validation par un administrateur.' });
      if (u.statut === 'refus') return rep({ ok: false, msg: 'Accès refusé par l’administrateur.' });
      return rep({ ok: true, nom: u.nom, role: estAdmin(u) || estProprio(u) ? 'admin' : u.role, proprio: estProprio(u), photo: u.photo || '' });
    }
    case 'ping': {   // présence : { email, mdp, page }
      if (!u || u.hash !== sha(String(o.mdp))) return rep({ ok: false });
      var now = new Date(), page = String(o.page || 'Plateforme').slice(0, 40);
      var lock = LockService.getScriptLock(); try { lock.waitLock(5000); f.getRange(u.row, 10, 1, 2).setValues([[now, page]]); compter(u, page, now); } finally { lock.releaseLock(); }
      return rep({ ok: true });
    }
    case 'photo': {
      if (!u || u.hash !== sha(String(o.mdp))) return rep({ ok: false, msg: 'Non autorisé.' });
      f.getRange(u.row, 5).setValue(String(o.photo || '').slice(0, 48000));
      return rep({ ok: true });
    }
    case 'liste': {
      if (!estProprio(u) || u.hash !== sha(String(o.mdp))) return rep({ ok: false, msg: 'Réservé au propriétaire de la plateforme.' });
      var v = f.getDataRange().getValues(), out = [];
      for (var i = 1; i < v.length; i++) if (v[i][0]) out.push({ email: v[i][0], nom: v[i][1], role: v[i][3] || 'user', cree: v[i][7] ? new Date(v[i][7]).toISOString() : '', statut: v[i][2] ? String(v[i][8] || 'ok') : 'incomplet', photo: v[i][4] ? 1 : 0, vu: v[i][9] ? new Date(v[i][9]).toISOString() : '', page: String(v[i][10] || '') });
      return rep({ ok: true, comptes: out });
    }
    case 'stats': {   // propriétaire : lignes jour·personne·interface des N derniers jours
      if (!estProprio(u) || u.hash !== sha(String(o.mdp))) return rep({ ok: false, msg: 'Réservé au propriétaire de la plateforme.' });
      var a = activite(), n = a.getLastRow(), lim = Utilities.formatDate(new Date(Date.now() - (Number(o.jours) || 90) * 864e5), 'Africa/Casablanca', 'yyyy-MM-dd'), rows = [];
      if (n > 1) { var v = a.getRange(2, 1, n - 1, 7).getDisplayValues(); for (var i = 0; i < v.length; i++) if (v[i][0] >= lim) rows.push([v[i][0], String(v[i][1]).toLowerCase(), v[i][2], v[i][3], Number(v[i][4]) || 0, Number(v[i][5]) || 0]); }
      return rep({ ok: true, rows: rows });
    }
    case 'maj': {   // { email: admin, mdp, cible, statut?, role?, suppr? }
      if (!estProprio(u) || u.hash !== sha(String(o.mdp))) return rep({ ok: false, msg: 'Réservé au propriétaire de la plateforme.' });
      var c = lire(String(o.cible || '').toLowerCase()); if (!c) return rep({ ok: false, msg: 'Compte introuvable.' });
      if (c.email.toLowerCase() === email && (o.suppr || o.role === 'user' || o.statut === 'refus')) return rep({ ok: false, msg: 'Vous ne pouvez pas retirer vos propres droits.' });
      if (o.suppr) { f.deleteRow(c.row); return rep({ ok: true }); }
      if (o.role) f.getRange(c.row, 4).setValue(o.role === 'admin' ? 'admin' : 'user');
      if (o.statut) {
        f.getRange(c.row, 9).setValue(o.statut);
        var d = demandes(), dv = d.getDataRange().getValues();
        for (var j = dv.length - 1; j >= 1; j--) if (String(dv[j][0]).toLowerCase() === c.email.toLowerCase()) { d.getRange(j + 1, 4).setValue(o.statut === 'ok' ? 'validé par ' + email : o.statut === 'refus' ? 'refusé par ' + email : o.statut); break; }
        if (o.statut === 'ok' && c.statut !== 'ok') MailApp.sendEmail({ to: c.email, subject: 'Plateforme CET · HMIMV — accès validé', htmlBody: '<p>Bonjour ' + (c.nom || '') + ',</p><p>Votre accès à la Plateforme CET · HMIMV a été validé. Vous pouvez vous connecter avec votre adresse et votre mot de passe.</p>' });
      }
      return rep({ ok: true });
    }
  }
  return rep({ ok: false, msg: 'Action inconnue.' });
}
function doGet() { return rep({ ok: true, service: 'comptes HMIMV' }); }
