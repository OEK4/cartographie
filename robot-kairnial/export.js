/* Robot Kairnial — se connecte avec VOTRE login (secrets GitHub), exporte la liste des documents, écrit kairnial.json.
   Les repères de page (sélecteurs) sont des hypothèses : à ajuster après le premier essai avec les captures d'écran. */
const { chromium } = require('playwright');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const KURL = process.env.KAIRNIAL_URL, LOGIN = process.env.KAIRNIAL_LOGIN, PASS = process.env.KAIRNIAL_PASSWORD, PROJET = process.env.KAIRNIAL_PROJET || '';
const PJ_URL = process.env.KAIRNIAL_PJ_URL || '', PJ_KEY = process.env.KAIRNIAL_PJ_KEY || '';   /* Apps Script « pièces jointes » → Google Drive privé */
const PJ_INDEX = path.join(__dirname, '..', 'pj-index.json');   /* mémoire : pièce déjà déposée = lien réutilisé, pas de nouveau téléchargement */
if (!KURL || !LOGIN || !PASS) { console.error('Secrets KAIRNIAL_URL / KAIRNIAL_LOGIN / KAIRNIAL_PASSWORD manquants'); process.exit(1); }
const CAP = path.join(__dirname, 'captures'); fs.mkdirSync(CAP, { recursive: true });
const DL = path.join(__dirname, 'dl'); fs.mkdirSync(DL, { recursive: true });

/* Premier élément visible parmi plusieurs repères, cherché dans la page ET dans tous ses cadres (le formulaire Kairnial est dans une iframe). */
async function premier(page, sels, t = 15000) {
  const fin = Date.now() + t;
  while (Date.now() < fin) {
    /* Repères dans l'ordre de priorité, puis cadres : le vrai champ "Identifiant" de l'iframe gagne sur un champ texte quelconque de la page. */
    for (const s of sels) for (const fr of page.frames()) {
      const n = Math.min(await fr.locator(s).count().catch(() => 0), 15);
      for (let i = 0; i < n; i++) { const l = fr.locator(s).nth(i); if (await l.isVisible().catch(() => false)) { l._repere = s; return l; } }
    }
    await page.waitForTimeout(300);
  }
  throw new Error('Repère introuvable : ' + sels.join(' | '));
}
/* Premier bouton visible, tous cadres confondus ; sinon null. */
async function bouton(page, sel) {
  for (const fr of page.frames()) {
    const n = Math.min(await fr.locator(sel).count().catch(() => 0), 15);
    for (let i = 0; i < n; i++) { const l = fr.locator(sel).nth(i); if (await l.isVisible().catch(() => false)) return l; }
  }
  return null;
}

const journal = [];
const note = m => { journal.push(new Date().toISOString().slice(11, 19) + ' ' + m); };

/* Pièces jointes des visas : le robot (connecté à Kairnial) les télécharge puis les dépose dans le Drive privé via Apps Script.
   Le lien de téléchargement est cherché dans l'objet visa (champs contenant une URL ou un chemin de fichier). */
/* Les pièces jointes des visas ne sont pas dans la liste : Kairnial les charge quand on ouvre le détail d'un fichier.
   Le robot ouvre quelques fichiers refusés commentés et note les services appelés + les réponses contenant des noms de fichiers. */
async function decouvrirPJ(page, out) {
  const cibles = out.filter(d => (d.visas || []).some(v => v.commentaire && /REF|VAO/.test(v.avis))).slice(0, 4);
  if (!cibles.length) return note('Découverte PJ : aucun fichier commenté');
  const vus = [];
  const ecoute = async rep => { try { const u = rep.url(); if (!/ws-[a-z0-9-]+\.kairnial\.com/.test(u) || /getFilesFromCat/.test(u)) return; const post = rep.request().postData() || ''; const svc = ((post.match(/"service":"([^"]+)"/) || [])[1] || u.split('/').pop()).replace(/^rgoc_\d+_[0-9a-f-]+\./, ''); const t = await rep.text().catch(() => ''); const f = (t.match(/[^"\\/]{3,160}\.(pdf|dwg|docx?|xlsx?|zip)/gi) || []).filter(x => !/^HMIMV-/.test(x)); vus.push({ svc, taille: t.length, fichiers: f.slice(0, 5), url: u.replace(/\?.*/, ''), post: post.slice(0, 1500), extrait: t.slice(0, 3000) }); } catch (e) {} };
  page.on('response', ecoute);
  /* 1) fichiers visibles de la liste (sans recherche) — le détail de chacun se charge au clic */
  const noms = page.locator('text=/^HMIMV-[A-Z0-9-]+\\.(pdf|dwg|docx?|xlsx?)$/i');
  const n = Math.min(6, await noms.count().catch(() => 0));
  note('Découverte PJ : ' + n + ' fichier(s) visibles à ouvrir');
  for (let i = 0; i < n; i++) {
    try { const el = noms.nth(i); await el.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {}); await el.click({ timeout: 8000 }); await page.waitForTimeout(6000);
      if (i === 0) await page.screenshot({ path: path.join(CAP, 'detail-1.png') }).catch(() => {});
      /* onglet « Commentaires / visas » du panneau de droite, s'il existe */
      const ong = page.locator('text=/^(Commentaires?|Visas?|Historique)$/i').first(); if (await ong.count()) { await ong.click({ timeout: 3000 }).catch(() => {}); await page.waitForTimeout(3000); }
    } catch (e) { note('Découverte PJ clic ' + (i + 1) + ' : ' + e.message.slice(0, 120)); }
  }
  /* 2) fichiers refusés commentés, via la recherche visible */
  for (const d of cibles.slice(0, 2)) {
    try {
      const champ = page.locator('input[placeholder*="Recherche" i]:visible').first();
      if (!(await champ.count())) break;
      await champ.click({ timeout: 5000 }); await champ.fill(d.code, { timeout: 8000 }); await champ.press('Enter'); await page.waitForTimeout(5000);
      const ligne = page.locator('text=' + (d.fichier || d.code)).first();
      if (await ligne.count()) { await ligne.click({ timeout: 8000 }).catch(() => {}); await page.waitForTimeout(7000); }
      await page.screenshot({ path: path.join(CAP, 'detail-' + d.code.slice(-12) + '.png') }).catch(() => {});
    } catch (e) { note('Découverte PJ ' + d.code + ' : ' + e.message.slice(0, 120)); }
  }
  page.off('response', ecoute);
  const avecF = vus.filter(v => v.fichiers.length);
  vus.slice(0, 30).forEach(v => note('Découverte PJ · appel ' + v.svc + ' (' + v.taille + ' car.)'));
  note('Découverte PJ : ' + vus.length + ' appel(s) · services : ' + [...new Set(vus.map(v => v.svc))].join(', '));
  avecF.slice(0, 4).forEach((v, i) => { note('Découverte PJ · ' + v.svc + ' → ' + v.fichiers.join(' ; ')); fs.writeFileSync(path.join(CAP, 'detail-' + (i + 1) + '.json'), JSON.stringify(v, null, 1)); });
  fs.writeFileSync(path.join(__dirname, '..', 'pj-decouverte.json'), JSON.stringify(vus.map(v => ({ svc: v.svc, taille: v.taille, fichiers: v.fichiers, post: v.post.replace(/"UserHash":"[^"]+"/, '"UserHash":"…"').slice(0, 800), extrait: v.extrait.slice(0, 2500) })), null, 1));
}

/* Pièces jointes des commentaires de visa (service fichiers.getFilesComments) :
   1) ouvre un document connu pour capter le modèle d'appel ; 2) rejoue l'appel pour chaque document commenté (liste des PJ) ;
   3) pour les nouvelles PJ (20 max / passage), ouvre le document, clique « télécharger » sous la PJ et dépose le fichier dans le Drive. */
const PJ_PRIO = 'HMIMV-EXE-BYM-230-SYP-ISS-TZ-TNX-0050-00';
async function ouvrirDoc(page, code) {
  const champ = page.locator('input[placeholder*="Recherche" i]:visible').first();
  if (!(await champ.count())) return false;
  await champ.click({ timeout: 5000 }); await champ.fill('', { timeout: 5000 }); await champ.fill(code, { timeout: 8000 }); await champ.press('Enter');
  await page.waitForTimeout(5000);
  const l = page.locator('text=/^' + code.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&') + '.*\\.(pdf|dwg|docx?|xlsx?|zip)$/i').first();
  if (!(await l.count())) return false;
  await l.click({ timeout: 8000 }); await page.waitForTimeout(6000); return true;
}
const nomsPJ = t => { let s = String(t); try { s = s.replace(/\\u([0-9a-f]{4})/gi, (m, h) => String.fromCharCode(parseInt(h, 16))).replace(/\\\//g, '/'); } catch (e) {} return [...new Set((s.match(/[\w\u00C0-\u017F][^"\\<>:|*?\n\/]{2,180}\.(pdf|dwg|docx?|xlsx?|zip|jpe?g|png)(?=["'\\\s,}\]]|$)/gi) || []).map(x => x.trim()).filter(x => !/^HMIMV-/i.test(x)))]; };
async function recupererPJ(page, out) {
  let idx = {}; try { idx = JSON.parse(fs.readFileSync(PJ_INDEX, 'utf8')); } catch (e) {}
  const req = globalThis.__ctx.request;
  let modele = null;
  const brut = [];
  const ecoute = async rep => { try { if (!/getFilesComments|getComments|comment/i.test(rep.url())) return; const q = rep.request(); const t = await rep.text().catch(() => ''); brut.push({ url: rep.url(), post: (q.postData() || '').replace(/"UserHash":"[^"]+"/, '"UserHash":"…"'), taille: t.length, reponse: t.slice(0, 20000) }); if (!modele && t.length > 10) modele = { url: rep.url(), post: q.postData() || '', headers: q.headers() }; } catch (e) {} };
  page.on('response', ecoute);
  const okPrio = await ouvrirDoc(page, PJ_PRIO).catch(e => { note('PJ : ouverture ' + PJ_PRIO + ' : ' + e.message.slice(0, 100)); return false; });
  await page.screenshot({ path: path.join(CAP, 'pj-prio.png') }).catch(() => {});
  await page.waitForTimeout(4000);
  page.off('response', ecoute);
  fs.writeFileSync(path.join(__dirname, '..', 'pj-decouverte.json'), JSON.stringify({ doc: PJ_PRIO, appels: brut }, null, 1));
  note('PJ : ' + brut.length + ' réponse(s) commentaires captée(s) pour ' + PJ_PRIO + ' · tailles ' + brut.map(b => b.taille).join(','));
  const dP = out.find(d => d.code === PJ_PRIO);
  if (!modele || !dP || !dP.item_id || modele.post.indexOf(String(dP.item_id)) < 0) { note('PJ : modèle getFilesComments ' + (modele ? 'capté mais identifiant introuvable' : 'non capté') + ' (ouverture ' + okPrio + ')'); return; }
  const H = {}; for (const k in modele.headers) if (!/^(content-length|host|cookie|:)/i.test(k)) H[k] = modele.headers[k];
  /* 2) liste des PJ par document commenté */
  const cibles = out.filter(d => d.item_id && (d.code === PJ_PRIO || (d.visas || []).some(v => v.commentaire))).slice(0, 600);
  let exemple = null, nb = 0;
  for (const d of cibles) {
    try {
      /* Appel rejoué DANS la page Kairnial (même session, mêmes cookies, même jeton) */
      const corps = modele.post.split(String(dP.item_id)).join(String(d.item_id));
      const t = await page.evaluate(async ([u, h, b]) => { try { const r = await fetch(u, { method: 'POST', headers: h, body: b, credentials: 'include' }); return await r.text(); } catch (e) { return 'ERR ' + e.message; } }, [modele.url, H, corps]);
      if (nb === 0 && d.code === PJ_PRIO) note('PJ : réponse rejouée pour ' + d.code + ' (' + t.length + ' car.) : ' + t.slice(0, 300).replace(/\s+/g, ' '));
      /* Réponse getFilesComments : { "<fileId>": [ { visaTitle, commentByFirstname/Lastname, commentDate, files:[{ entete_nom, item_id, path, size }] } ] } */
      let n = [], meta = {};
      try { const o = JSON.parse(t); Object.values(o).forEach(arr => (Array.isArray(arr) ? arr : []).forEach(c => (c.files || []).forEach(f => { if (f.entete_nom && !n.includes(f.entete_nom)) { n.push(f.entete_nom); meta[f.entete_nom] = { item: f.item_id, path: f.path, size: +f.size || 0, visa: c.visaTitle || '', par: ((c.commentByFirstname || '') + ' ' + (c.commentByLastname || '')).trim(), date: c.commentDate ? new Date(c.commentDate * 1000).toISOString() : '' }; } }))); } catch (e) { n = nomsPJ(t); }
      if (n.length) { d.pjDoc = n.map(x => ({ n: x, u: idx[d.code + '|' + x] || '', m: meta[x] || {} })); nb += n.length; if (!exemple) exemple = { code: d.code, reponse: t.slice(0, 8000) }; }
    } catch (e) {}
  }
  note('PJ : ' + cibles.length + ' document(s) commenté(s) interrogé(s) · ' + nb + ' pièce(s) jointe(s) trouvée(s)');
  if (exemple) note('PJ exemple ' + exemple.code + ' : ' + exemple.reponse.slice(0, 600).replace(/\s+/g, ' '));
  /* 3) téléchargement des nouvelles PJ → Drive */
  if (!PJ_URL) { note('PJ : dépôt Drive désactivé (secret KAIRNIAL_PJ_URL absent)'); return; }
  let dep = 0, ko = 0;
  for (const d of out.filter(x => (x.pjDoc || []).some(p => !p.u))) {
    if (dep >= 20) break;
    if (!(await ouvrirDoc(page, d.code).catch(() => false))) { ko++; continue; }
    for (const p of d.pjDoc.filter(p => !p.u)) {
      if (dep >= 20) break;
      try {
        const nom = page.locator('text=' + p.n).first();
        if (!(await nom.count())) throw new Error('nom absent du panneau');
        const boite = nom.locator('xpath=ancestor::*[.//button or .//a or .//*[@ng-click]][1]');
        const btns = boite.locator('button, a, [ng-click], i, .fa');
        const nbB = await btns.count(); let dl = null;
        for (let k = nbB - 1; k >= 0 && !dl; k--) { dl = await Promise.all([page.waitForEvent('download', { timeout: 12000 }), btns.nth(k).click({ timeout: 5000 })]).then(x => x[0]).catch(() => null); }
        if (!dl) throw new Error('bouton de téléchargement non trouvé');
        const f = await dl.path(); const buf = fs.readFileSync(f);
        if (buf.length > 25e6) throw new Error('fichier > 25 Mo');
        const rep = await fetch(PJ_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ a: 'pj', key: PJ_KEY, doc: d.code, lot: d.lot, nom: p.n, data: buf.toString('base64') }) });
        const j = await rep.json(); if (!j.ok || !j.url) throw new Error(j.msg || 'dépôt refusé');
        p.u = j.url; idx[d.code + '|' + p.n] = j.url; dep++;
      } catch (e) { ko++; if (ko <= 6) note('PJ échec ' + d.code + ' · ' + p.n + ' : ' + e.message.slice(0, 120)); }
    }
  }
  fs.writeFileSync(PJ_INDEX, JSON.stringify(idx));
  note('PJ : ' + dep + ' déposée(s) dans le Drive ce passage · ' + ko + ' échec(s) · ' + Object.keys(idx).length + ' au total');
}

async function deposerPJ(out, ctx, base) {
  let idx = {}; try { idx = JSON.parse(fs.readFileSync(PJ_INDEX, 'utf8')); } catch (e) {}
  const visas = []; out.forEach(d => (d.visas || []).forEach(v => { if (v.pj && v.pj.length) visas.push([d, v]); }));
  let vu = 0, neuf = 0, ko = 0, echantillon = 0;
  for (const [d, v] of visas) {
    const raw = v._raw || {}; delete v._raw;
    const urls = []; const scan = (o, k) => { if (o == null) return; if (typeof o === 'string') { if (/^https?:\/\//i.test(o) || /\.(pdf|dwg|docx?|xlsx?|zip|jpe?g|png)(\?|$)/i.test(o) && /[\/=]/.test(o)) urls.push([k, o]); return; } if (typeof o === 'object') for (const kk in o) scan(o[kk], kk); };
    scan(raw, '');
    if (echantillon < 3) { echantillon++; note('PJ échantillon ' + d.code + ' : clés ' + Object.keys(raw).join(',') + ' · liens ' + JSON.stringify(urls).slice(0, 600)); }
    v.pjl = v.pj.map(n => {
      const cle = d.code + '|' + n; vu++;
      if (idx[cle]) return { n, u: idx[cle] };
      const u = (urls.find(x => x[1].indexOf(n) >= 0 || decodeURIComponent(x[1]).indexOf(n) >= 0) || urls.find(x => /download|telecharg|getfile|attach|piece|fichier|file/i.test(x[0] + x[1])) || [])[1];
      return { n, src: u || '' };
    });
  }
  if (!PJ_URL || !globalThis.__ctx) { note('PJ : ' + vu + ' pièce(s) jointe(s) relevée(s)' + (PJ_URL ? '' : ' · dépôt Drive désactivé (secret KAIRNIAL_PJ_URL absent)')); for (const [, v] of visas) (v.pjl || []).forEach(p => delete p.src); return; }
  const req = globalThis.__ctx.request, root = new URL(KURL).origin;
  for (const [d, v] of visas) for (const p of v.pjl || []) {
    if (p.u || !p.src) { delete p.src; continue; }
    if (neuf >= 40) { delete p.src; continue; }   /* au plus 40 nouveaux fichiers par passage */
    try {
      const abs = /^https?:/i.test(p.src) ? p.src : root + (p.src.startsWith('/') ? '' : '/') + p.src;
      const r = await req.get(abs, { timeout: 60000 });
      const buf = await r.body();
      if (!r.ok() || buf.length < 200 || /text\/html/i.test(r.headers()['content-type'] || '')) throw new Error('HTTP ' + r.status());
      if (buf.length > 25e6) throw new Error('fichier > 25 Mo');
      const rep = await fetch(PJ_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ a: 'pj', key: PJ_KEY, doc: d.code, lot: d.lot, nom: p.n, data: buf.toString('base64') }) });
      const j = await rep.json();
      if (!j.ok || !j.url) throw new Error(j.msg || 'dépôt refusé');
      p.u = j.url; idx[d.code + '|' + p.n] = j.url; neuf++;
    } catch (e) { ko++; if (ko <= 5) note('PJ échec ' + p.n + ' : ' + e.message); }
    delete p.src;
  }
  fs.writeFileSync(PJ_INDEX, JSON.stringify(idx));
  note('PJ : ' + vu + ' relevée(s) · ' + neuf + ' déposée(s) ce passage · ' + ko + ' échec(s) · ' + Object.keys(idx).length + ' au total dans le Drive');
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ acceptDownloads: true, locale: 'fr-FR', viewport: { width: 1600, height: 1000 } }); globalThis.__ctx = ctx;
  let page = await ctx.newPage();
  /* Si Kairnial ouvre un module dans un nouvel onglet, on bascule dessus */
  /* Écoute des réponses du serveur : la liste des documents arrive en JSON — on garde celles qui contiennent des codes HMIMV */
  const api = []; let nApi = 0; const appels = []; const defs = []; let circuitsDef = null; const collecte = new Map(); let totalService = 0;
  const reduire = (o) => { const F = o.fichiers || []; const V = o.visas || {}; totalService = +o.total || totalService; for (const f of F) { const s = {}; const vv = V[f.item_id] || {}; for (const k in vv) { const v = vv[k]; if (v.sub !== undefined) { s[k] = v; continue; } if (String(v.fv_subvisa) !== '-2') s[k] = { sub: v.fv_subvisa, date: v.fv_date, com: v.comment || '', par: [v.sender_firestname, v.sender_lastname].filter(Boolean).join(' '), titre: v.titleVisa || '', chrono: v.numChronoVisa || '', raw: v, pj: [...new Set((JSON.stringify(v).match(/[^"\\/:*?<>|]{3,180}\.(pdf|dwg|docx?|xlsx?|zip|jpe?g|png)\b/gi) || []).map(x => x.trim()))].slice(0, 12) }; } collecte.set(String(f.item_id), { item_id: f.item_id, entete_nom: f.entete_nom, entete_oldName: f.entete_oldName, files_desc: f.files_desc, files_date: f.files_date, files_size: f.files_size, circuit: f.circuit, createby: f.createby, user_email: f.user_email, entete_archive: f.entete_archive, files_nbrev: f.files_nbrev, fcat_chemin: f.fcat_chemin, visas: s }); } return F.length; };
  const xhrVus = [];
  ctx.on('response', async rep => { try { const rt = rep.request().resourceType(); if ((rt === 'xhr' || rt === 'fetch') && xhrVus.length < 80) xhrVus.push(rep.status() + ' ' + rep.request().method() + ' ' + rep.url().replace(/\?.*/, '').slice(-90) + ' [' + (rep.headers()['content-type'] || '').slice(0, 30) + ']'); } catch (e) {} });
  ctx.on('response', async rep => { try { const u0 = rep.url(); if (!/getFilesFromCat/i.test(u0)) return; const ct0 = rep.headers()['content-type'] || ''; if (/json|html|text/i.test(ct0)) return; const t0 = await rep.text().catch(() => ''); note('Liste fichiers reçue en ' + (ct0 || 'type inconnu') + ' · ' + t0.length + ' car.'); const req0 = rep.request(); appels.push({ url: u0, post: req0.postData() || '', headers: req0.headers() }); try { reduire(JSON.parse(t0)); } catch (e) { note('Liste fichiers illisible : ' + e.message); } } catch (e) {} });
  ctx.on('response', async rep => { try { const ct = rep.headers()['content-type'] || ''; if (/image|font|css|javascript|octet/i.test(ct)) return; const t = await rep.text(); if (!/HMIMV-/.test(t) && !/getFilesFromCat/.test(rep.url())) return; const u = rep.url(); const req = rep.request(); const postFull = req.postData() || ''; const post = postFull.slice(0, 300); if (/getFilesFromCat/.test(u)) { appels.push({ url: u, post: postFull, headers: req.headers() }); try { reduire(JSON.parse(t)); } catch (e) { note('getFilesFromCat illisible : ' + e.message + ' · ' + t.slice(0, 120)); } } api.push({ url: u.replace(/\?.*/, '').slice(0, 160), ct: ct.slice(0, 40), method: req.method(), post, taille: t.length, nb: (t.match(/HMIMV-/g) || []).length }); if (nApi < 3) { nApi++; fs.writeFileSync(path.join(CAP, 'api-' + nApi + '.json'), t.slice(0, 400000)); } } catch (e) {} });
  ctx.on('response', async rep => { try { const ct = rep.headers()['content-type'] || ''; if (!/json/i.test(ct)) return; const t = await rep.text(); if (/"circuitsContent"/.test(t) && !circuitsDef) { circuitsDef = t; fs.writeFileSync(path.join(CAP, 'circuits.json'), t.slice(0, 3000000)); } if (/SOCOTEC|Bureau Contr/i.test(t) && !/getFilesFromCat/.test(rep.url()) && defs.length < 4) { defs.push({ url: rep.url().replace(/\?.*/, '').slice(0, 160), text: t }); fs.writeFileSync(path.join(CAP, 'def-' + defs.length + '.json'), t.slice(0, 2000000)); } } catch (e) {} });
  ctx.on('page', async p => { try { await p.waitForLoadState('domcontentloaded'); page = p; note('Nouvel onglet : ' + p.url().slice(0, 60)); } catch (e) {} });
  /* Adresse sans paramètres (pas de jeton dans le journal) */
  const ou = () => { try { const u = new URL(page.url()); return u.host + u.pathname + u.hash.slice(0, 40); } catch (e) { return '?'; } };
  const texte = async () => { let s = ''; for (const fr of page.frames()) s += ' ' + (await fr.evaluate(() => (document.body && document.body.innerText) || '').catch(() => '')); return s.replace(/\s+/g, ' ').slice(0, 400); };
  const attendreLoader = async (t = 60000) => { const fin = Date.now() + t; while (Date.now() < fin) { let vis = false; for (const fr of page.frames()) for (const e of await fr.locator('text=/Veuillez patienter|Please wait/i').all().catch(() => [])) if (await e.isVisible().catch(() => false)) { vis = true; break; } if (!vis) return; await page.waitForTimeout(300); } };
  try {
    /* 1. Connexion — Kairnial affiche un écran "Veuillez patienter" puis la page de connexion.
       Le champ mot de passe peut n'apparaître qu'après la saisie de l'identifiant : on tape lentement, on attend, puis on clique "Connexion" si besoin. */
    const SEL_USER = ['input[placeholder*="Identifiant" i]', '#username', 'input[name="username"]', 'input[type="email"]', 'input[name*="login" i]', 'input[name*="user" i]', 'input[placeholder*="mail" i]', 'form input[type="text"]'];
    const SEL_PWD = ['#password', 'input[name="password"]', 'input[type="password"]'];
    /* Jusqu'à 3 essais : si l'écran d'attente ne débouche pas sur la page de connexion (Kairnial lent), on recharge. */
    let user = null;
    for (let essai = 1; essai <= 3 && !user; essai++) {
      await page.goto(KURL, { waitUntil: 'domcontentloaded' }).catch(() => {});
      await attendreLoader();
      user = await premier(page, SEL_USER, essai < 3 ? 45000 : 60000).catch(() => null);
      if (!user) { note('Connexion : page de connexion non affichée (essai ' + essai + '/3) — rechargement'); await page.screenshot({ path: path.join(CAP, '00-attente-' + essai + '.png') }).catch(() => {}); await page.waitForTimeout(5000); }
    }
    if (!user) throw new Error('Kairnial n’a pas affiché la page de connexion après 3 essais (service lent ou indisponible)');
    await attendreLoader(); await page.waitForTimeout(1500);
    note('Page de connexion : ' + ou() + ' | champ identifiant = ' + user._repere + ' | ' + await texte());
    await page.screenshot({ path: path.join(CAP, '01-login.png') });
    await user.click({ timeout: 15000 }).catch(() => {});
    await user.pressSequentially(LOGIN, { delay: 60 }).catch(async () => { await user.fill(LOGIN, { force: true }); });
    await page.waitForTimeout(2500);
    note('Identifiant saisi : ' + ((await user.inputValue().catch(() => '')) ? 'ok' : 'CHAMP VIDE'));
    await user.press('Tab').catch(() => {});
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(CAP, '02-identifiant-saisi.png') });
    let pwd = await premier(page, SEL_PWD, 8000).catch(() => null);
    if (!pwd) {
      const btn1 = await bouton(page, '#kc-login, button:has-text("Connexion"), input[type="submit"], button[type="submit"], button:has-text("Login"), button:has-text("Suivant"), button:has-text("Continuer")');
      if (btn1) await btn1.click({ timeout: 10000 }).catch(() => user.press('Enter')); else await user.press('Enter');
      note('Bouton Connexion cliqué, attente du champ mot de passe');
      for (let n = 1; n <= 10 && !pwd; n++) {
        await page.waitForTimeout(3000);
        await page.screenshot({ path: path.join(CAP, '03-attente-' + String(n).padStart(2, '0') + '.png') }).catch(() => {});
        note('attente ' + n + ' : ' + ou() + ' | ' + await texte());
        pwd = await premier(page, SEL_PWD, 500).catch(() => null);
        if (!pwd && n >= 4) { const u2 = await premier(page, SEL_USER, 500).catch(() => null); if (u2 && !(await u2.inputValue().catch(() => ''))) { note('Retour à la page de connexion, nouvelle saisie de l\'identifiant'); await u2.click().catch(() => {}); await u2.pressSequentially(LOGIN, { delay: 80 }).catch(() => {}); await page.waitForTimeout(4000); pwd = await premier(page, SEL_PWD, 500).catch(() => null); if (!pwd) await u2.press('Enter'); } }
      }
    }
    if (!pwd) throw new Error('Champ mot de passe jamais apparu — voir journal.txt et captures 03-*');
    await pwd.click({ timeout: 15000 }).catch(() => {});
    await pwd.pressSequentially(PASS, { delay: 50 }).catch(async () => { await pwd.fill(PASS, { force: true }); });
    await page.waitForTimeout(800);
    const btn2 = await bouton(page, '#kc-login, button:has-text("Connexion"), input[type="submit"], button[type="submit"], button:has-text("Login"), button:has-text("Se connecter")');
    if (btn2) await btn2.click({ timeout: 10000 }).catch(() => pwd.press('Enter')); else await pwd.press('Enter');
    await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {});
    await attendreLoader(); await page.waitForTimeout(4000);
    note('Après connexion : ' + ou() + ' | ' + await texte());
    await page.screenshot({ path: path.join(CAP, '04-apres-connexion.png') });
    if (await bouton(page, 'input[type="password"]')) throw new Error('Connexion refusée (identifiant ou mot de passe) — voir 04-apres-connexion.png');
    if (!/rfiles/.test(page.url())) { await page.goto(KURL, { waitUntil: 'domcontentloaded' }); await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {}); await attendreLoader(); await page.waitForTimeout(4000); }

    /* 2. Projet HMIMV puis liste des fichiers (si l'URL n'y mène pas déjà) */
    await page.screenshot({ path: path.join(CAP, '05-accueil.png') });
    if (PROJET) {
      const p = await bouton(page, 'text=' + PROJET);
      if (p) {
        note('Projet trouvé : ' + PROJET);
        await p.click(); await page.waitForTimeout(2500);
        if (await bouton(page, 'input[placeholder*="Rechercher" i]')) { const p2 = await bouton(page, 'text=' + PROJET); if (p2) await p2.dblclick().catch(() => {}); }
        await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {}); await attendreLoader(); await page.waitForTimeout(4000);
        note('Après choix du projet : ' + ou() + ' | ' + await texte());
      } else note('Projet "' + PROJET + '" non trouvé à l\'écran — on continue');
    }
    /* Menu latéral "Documents" (page d'accueil du projet avec la photo) */
    const diag = async (tag) => { const d = []; for (const fr of page.frames()) { const i = await fr.evaluate(() => ({ u: location.href.slice(0, 70), inputs: document.querySelectorAll('input').length, boutons: document.querySelectorAll('button,[role="button"]').length, shadow: Array.from(document.querySelectorAll('*')).filter(e => e.shadowRoot).length, texte: (document.body && document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 120) })).catch(() => null); if (i) d.push(JSON.stringify(i)); } note('DIAG ' + tag + ' : ' + d.join(' ## ')); };
    const listeOK = async () => !!(await bouton(page, 'text=Derniers items, text=Mes fichiers, input[placeholder*="Recherche" i]'));
    if (!(await listeOK())) {
      /* Changer d'adresse ne suffit pas : rechargement complet sur la liste des fichiers */
      note('Rechargement complet sur la liste des fichiers');
      await page.goto(KURL, { waitUntil: 'domcontentloaded' }).catch(() => {});
      await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
      await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {}); await attendreLoader(); await page.waitForTimeout(5000);
      await page.screenshot({ path: path.join(CAP, '06a-apres-rechargement.png') }).catch(() => {});
      await diag('après rechargement');
    }
    if (!(await listeOK())) {
      const docs = await bouton(page, 'a:has-text("Documents"), [role="menuitem"]:has-text("Documents"), li:has-text("Documents"), span:has-text("Documents")');
      if (docs) {
        note('Clic sur Documents (' + (await docs.evaluate(e => e.tagName + ' ' + (e.getAttribute('href') || e.getAttribute('ui-sref') || e.getAttribute('ng-click') || '')).catch(() => '?')) + ')');
        await docs.click({ timeout: 10000 }).catch(() => {});
        for (let n = 0; n < 6 && !(await listeOK()); n++) { await page.waitForTimeout(10000); await attendreLoader(); await page.screenshot({ path: path.join(CAP, '06b-attente-' + n + '.png') }).catch(() => {}); }
        await diag('après clic Documents');
      } else note('Menu Documents introuvable');
    }
    await page.waitForTimeout(3000);
    note('Liste des documents : ' + ou() + ' | ' + await texte());
    await diag('liste');
    await page.screenshot({ path: path.join(CAP, '06-documents.png') });
    note('API captées : ' + JSON.stringify(api));
    /* Pagination au maximum (liste déroulante "30" en bas) */
    try {
      const sel = await bouton(page, 'select');
      if (sel) {
        const opts = await sel.evaluate(s => Array.from(s.options).map(o => o.value + '=' + o.text));
        note('Options de pagination : ' + opts.join(' '));
        const best = await sel.evaluate(s => { let b = s.options[0]; for (const o of s.options) if (parseInt(o.text) > parseInt(b.text)) b = o; return b.value; });
        await sel.selectOption(best); await page.waitForTimeout(6000); await attendreLoader();
        note('Pagination réglée sur ' + best + ' | ' + await texte());
      } else note('Liste déroulante de pagination introuvable');
    } catch (e) { note('Pagination : ' + e.message); }
    await page.screenshot({ path: path.join(CAP, '06c-pagination.png') }).catch(() => {});

    /* 3. Lecture de la liste à l'écran, page après page (l'export Excel ne couvre que la sélection d'une page). */
    const lireVisible = async () => {
      let rows = [];
      for (const fr of page.frames()) {
        let r = [];
        try {
          r = await fr.evaluate(() => {
            const out = [];
            const titres = Array.from(document.querySelectorAll('a, span, div, b, strong, h4, h5')).filter(e => e.children.length <= 1 && /^HMIMV-[A-Z0-9-]+\.[a-z0-9]{2,5}$/i.test((e.innerText || '').trim()));
            const vus = new Set();
            for (const t of titres) {
              let row = t;
              for (let i = 0; i < 8 && row.parentElement; i++) { row = row.parentElement; const tx = row.innerText || ''; if (/\d{2}\/\d{2}\/\d{4}/.test(tx) && row.getBoundingClientRect().height < 600) break; }
              if (vus.has(row)) continue; vus.add(row);
              const tx = (row.innerText || '').replace(/\s+/g, ' ');
              const m = tx.match(/([A-ZÀ-Ü][A-ZÀ-Ü' .-]{2,60}?) (\d{2}\/\d{2}\/\d{4})/);
              const desc = (tx.match(/\[(.*?)\]/) || ['', ''])[1];
              const badges = Array.from(row.querySelectorAll('span, div, a, label')).filter(e => e.children.length === 0 && /^(\d{2}-[A-Z]{2,4} - |Lot \d+)/.test((e.innerText || '').trim())).map(e => { const cs = getComputedStyle(e); return { t: e.innerText.trim(), bg: cs.backgroundColor, fg: cs.color, title: e.getAttribute('title') || e.getAttribute('data-original-title') || e.getAttribute('tooltip') || '' }; });
              out.push({ fichier: t.innerText.trim(), desc, emetteur: m ? m[1].trim() : '', date: m ? m[2] : '', badges, html: out.length < 2 ? row.outerHTML.replace(/\s+/g, ' ').slice(0, 3000) : '' });
            }
            return out;
          });
        } catch (e) { r = []; }
        rows = rows.concat(r);
      }
      return rows;
    };
    /* === Source de données : fichiers.getFilesFromCat. 1) rejoué depuis la page avec un jeton CSRF frais ; 2) sinon, pagination à l'écran en captant chaque réponse === */
    let viaApi = null;
    const t0 = (await texte()) + ' ';
    let total = parseInt((t0.match(/de (\d+) Fichiers/) || [0, 0])[1]) || 0;
    if (!total) { for (const fr of page.frames()) { const m = (await fr.evaluate(() => document.body ? document.body.innerText : '').catch(() => '')).replace(/\s+/g, ' ').match(/de (\d+) Fichiers/); if (m) { total = +m[1]; break; } } }
    const parPage = parseInt((t0.match(/1 - (\d+) de/) || [0, 50])[1]) || 50;
    const nbPages = total ? Math.ceil(total / parPage) : 1;
    note('Total ' + total + ' fichiers, ' + parPage + ' par page, ' + nbPages + ' pages ; déjà collectés : ' + collecte.size);
    const TAKE = 100; let ok = false;
    try {
      const dernier = appels[appels.length - 1];
      if (!dernier) { note('Appels réseau vus (' + xhrVus.length + ') : ' + xhrVus.join(' | ')); throw new Error('aucun appel getFilesFromCat capté'); }
      fs.writeFileSync(path.join(CAP, 'appel-post.json'), dernier.post.slice(0, 20000));
      const body = JSON.parse(dernier.post); const P = body.params[0];
      const hdr = {}; for (const k in dernier.headers) if (/^(content-type|accept|x-xsrf-token|x-csrf-token|authorization|userhash|machineid)$/i.test(k)) hdr[k] = dernier.headers[k];
      note('En-têtes rejoués : ' + Object.keys(hdr).join(', '));
      const cookies = await ctx.cookies(); const ck = cookies.find(c => /xsrf|csrf/i.test(c.name));
      note('Cookies : ' + cookies.map(c => c.name).join(', ') + (ck ? ' | jeton CSRF trouvé dans ' + ck.name : ' | aucun cookie CSRF'));
      for (let skip = 0; skip < 20000; skip += TAKE) {
        P.LIMITSKIP = skip; P.LIMITTAKE = TAKE; P.microtime = Date.now();
        const ckNow = (await ctx.cookies()).find(c => /xsrf|csrf/i.test(c.name));
        const res = await page.evaluate(async ({ url, hdr, body, cookieTok }) => {
          const m = document.cookie.match(/(?:^|;\s*)(XSRF-TOKEN|csrf_token|_csrf|XSRF_TOKEN)=([^;]+)/i);
          const tok = cookieTok || (m ? decodeURIComponent(m[2]) : null);
          if (tok) { body.headers['X-XSRF-TOKEN'] = tok; if (hdr['x-xsrf-token'] !== undefined) hdr['x-xsrf-token'] = tok; }
          let r, t; try { r = await fetch(url, { method: 'POST', headers: hdr, body: JSON.stringify(body), credentials: 'include' }); t = await r.text(); } catch (e) { return { status: 0, err: String(e), tok: tok ? 'oui' : 'non' }; }
          if (r.status !== 200) return { status: r.status, err: t.slice(0, 300), tok: tok ? 'oui' : 'non' };
          let o; try { o = JSON.parse(t); } catch (e) { return { status: 0, err: 'JSON invalide', tok: tok ? 'oui' : 'non' }; } const F = o.fichiers || []; const V = o.visas || {}; const vu = {};
          for (const id in V) { const s = {}; for (const k in V[id]) { const v = V[id][k]; if (String(v.fv_subvisa) !== '-2') s[k] = v; } vu[id] = s; }
          return { status: 200, total: o.total, n: F.length, data: { fichiers: F, visas: vu, total: o.total } };
        }, { url: dernier.url, hdr, body, cookieTok: ckNow ? ckNow.value : (ck ? ck.value : null) });
        if (res.status !== 200) { note('Tranche ' + skip + ' : HTTP ' + res.status + ' ' + (res.err || '') + ' (jeton page : ' + res.tok + ')'); break; }
        ok = true; const n = reduire(res.data);
        if (skip === 0 || (skip / TAKE) % 10 === 0) note('Tranche ' + skip + ' : ' + n + ' fichiers (total annoncé ' + res.total + ')');
        if (n < TAKE || (totalService && collecte.size >= totalService)) break;
      }
    } catch (e) { note('Service de données : ' + e.message); }
    if (!ok || (totalService && collecte.size < totalService)) {
      try {
        /* Repli : parcourir les pages à l'écran ; chaque page déclenche un appel getFilesFromCat que l'on réduit au vol */
        note('Repli : pagination à l\'écran sur ' + nbPages + ' pages');
        const debutPg = Math.max(2, Math.floor(collecte.size / parPage) + 1);
        for (let pg = debutPg; pg <= nbPages && pg <= 400; pg++) {
          const avant = collecte.size; let clique = false;
          for (const fr of page.frames()) {
            const cand = fr.locator('a, li, span, button').filter({ hasText: new RegExp('^\\s*' + pg + '\\s*$') });
            const n = Math.min(await cand.count().catch(() => 0), 20);
            for (let i = n - 1; i >= 0; i--) { const l = cand.nth(i); const bb = await l.boundingBox().catch(() => null); if (bb && bb.y > 700 && await l.isVisible().catch(() => false)) { await l.click({ timeout: 5000 }).catch(() => {}); clique = true; break; } }
            if (clique) break;
          }
          if (!clique) { note('Page ' + pg + ' : bouton introuvable — arrêt'); break; }
          for (let w = 0; w < 40 && collecte.size === avant; w++) await page.waitForTimeout(500);
          await attendreLoader();
          if (pg % 10 === 0) note('Page ' + pg + '/' + nbPages + ' : cumul ' + collecte.size);
          if (collecte.size === avant) note('Page ' + pg + ' : aucune nouvelle donnée');
        }
      } catch (e) { note('Pagination : ' + e.message); }
    }
    note('Collecte : ' + collecte.size + ' fichiers (total service ' + totalService + ')');
    if (collecte.size) { const fichiers = [...collecte.values()]; const visas = {}; fichiers.forEach(f => { visas[f.item_id] = f.visas; }); viaApi = { fichiers, visas, total: totalService || total }; }
    if (viaApi) {
      /* Circuits de visa : libellé et liste des avis possibles de chaque étape (réponse init.getTabs captée) */
      const circuits = {}; const nomsCircuits = {};
      try { const c = JSON.parse(circuitsDef || '{}'); Object.assign(nomsCircuits, c.circuitsName || {}); for (const ck in (c.circuitsContent || {})) { const id = ck.replace(/^c/, ''); circuits[id] = {}; for (const sk in c.circuitsContent[ck]) { const st = c.circuitsContent[ck][sk]; let subs = []; try { subs = JSON.parse(st.notes_content || '{}').subVisas || []; } catch (e) {} circuits[id][sk.replace(/^c/, '')] = { label: st.label || '', subs }; } } } catch (e) { note('Circuits : ' + e.message); }
      note('Circuits connus : ' + Object.keys(circuits).map(k => k + '=' + nomsCircuits[k] + ' (' + Object.keys(circuits[k]).length + ' étapes)').join(', '));
      const norm = lab => { lab = String(lab || '').toUpperCase(); return /^FAV|VSO|^VAL$|APPROUV/.test(lab) ? 'VSO' : /VAB|REF|DEFAV|REJ/.test(lab) ? 'REF' : /VAO|OBS/.test(lab) ? 'VAO' : /^NC|ANN|PI$|INFO/.test(lab) ? 'NC' : 'ATT'; };
      const out = [];
      for (const f of viaApi.fichiers) {
        const nom = String(f.entete_nom || f.entete_oldName || ''); if (!nom) continue;
        const nomenclature = /^HMIMV-/i.test(nom);
        const brut = nom.replace(/\.[a-z0-9]{2,5}$/i, ''), code = nomenclature ? brut.split('_')[0].trim() : brut, p = nomenclature ? code.split('-') : [];
        const cheminF = String(f.fcat_chemin || ''); const phaseM = cheminF.match(/0[0-4]\s*-?\s*(R[ÉE]F[ÉE]RENCE|MARCH[ÉE]|APS|APD|EXE)/i);
        const phaseDossier = phaseM ? phaseM[1].toUpperCase().replace(/[ÉE]/g, 'E').replace('REFERENCE', 'REF') : '';
        const circ = circuits[String(f.circuit)] || {}; const vs = viaApi.visas[f.item_id] || {};
        const visas = Object.keys(vs).map(k => { const v = vs[k], st = circ[k] || {}, lab = st.label || ('Étape ' + k); const s = String(v.sub); const sv = s === '-1' ? null : (st.subs || []).find(x => String(x.index) === s); const avis = s === '-1' ? 'ATT' : sv ? norm(sv.label) : 'ATT'; const k0 = (lab.match(/^\d{2}-([A-Z]{2,5})/) || lab.match(/^([A-Z]{2,5})\b/) || ['', 'V' + k])[1], spe = (lab.match(/\b(ELEC|VRD|FLUIDE|STRUCT|CVC|PLOMB|SSI|HQE|ACOUST|CFA|CFO)/i) || [''])[0].toUpperCase().replace('FLUIDE', 'FLU').replace('STRUCT', 'STR').replace('PLOMB', 'PLB').replace('ACOUST', 'ACO');
          return { etape: +k, k: spe && spe !== k0 ? k0 + ' ' + spe : k0, lab, pj: v.pj || [], lot: /^Lot \d+/.test(lab), interne: !/^Lot \d+/.test(lab) && (/BYMARO|^Étape \d+$|^_+$|^\d+$/i.test(lab) || !lab.trim()), avis, code: sv ? sv.label : (s === '-1' ? 'ATT' : s), libelle: sv ? sv.LongDesc : (s === '-1' ? 'En attente de visa' : ''), date: v.date ? new Date(+v.date * 1000).toISOString() : '', par: v.par, commentaire: v.com, titre: v.titre, chrono: v.chrono, _raw: v.raw }; }).sort((a, b) => a.etape - b.etape);
        const inter = visas.filter(v => !v.lot && !v.interne); const lotStep = visas.find(v => v.lot);
        const etat = inter.some(v => v.avis === 'REF') ? 'REF' : inter.some(v => v.avis === 'ATT') ? 'ATT' : inter.some(v => v.avis === 'VAO') ? 'VAO' : inter.some(v => v.avis === 'VSO') ? 'VSO' : 'ATT';
        const chemin = cheminF; const lotM = chemin.match(/Lot (\d+)\s*-\s*([^/]+)/i);
        out.push({ code, fichier: nom, titre: String(f.files_desc || f.entete_oldName || brut).replace(/\.[a-z0-9]{2,5}$/i, ''), nomenclature, phase: (p[1] || phaseDossier || '').toUpperCase(), lot: p[3] || (lotM ? lotM[1] : ''), lotLab: lotStep ? lotStep.lab : (lotM ? 'Lot ' + lotM[1] + ' - ' + lotM[2].trim() : ''), dossier: chemin, type: p[4] || (nomenclature ? '' : 'AUT'), bat: (p[5] || (nomenclature ? '' : 'AUT')).toUpperCase(), zone: p[6] || '', niveau: p[7] || '', indice: String(p[9] || '00').padStart(2, '0'), emetteur: String(f.createby || ''), email: String(f.user_email || ''), date: f.files_date ? new Date(+f.files_date * 1000).toISOString() : '', depot: lotStep && lotStep.date ? lotStep.date : '', taille: +f.files_size || 0, revisions: +f.files_nbrev || 1, archive: f.entete_archive === '1', circuit: nomsCircuits[String(f.circuit)] || String(f.circuit || ''), etat, visas, item_id: f.item_id });
      }
      if (!out.length) throw new Error('Service de données : aucun fichier');
      await deposerPJ(out);
      await recupererPJ(page, out).catch(e => note('PJ commentaires : ' + e.message));
      out.forEach(d => delete d.item_id);
      note('Dont hors nomenclature HMIMV : ' + out.filter(d => !d.nomenclature).length);
      fs.writeFileSync(path.join(__dirname, '..', 'kairnial.json'), JSON.stringify({ ok: true, date: new Date().toISOString(), total: viaApi.total || total || out.length, source: 'service', docs: out }));
      note('kairnial.json écrit depuis le service : ' + out.length + ' documents');
      console.log(out.length + ' documents (service de données)');
      return;
    }
    const tous = new Map(); const exemples = []; const histo = {}; let colonnesRapport = []; let nbRapports = 0;
    /* Barre d'outils : ■ (afficher les cases) = 1er bouton 1re rangée ; icône Excel "Fiche de synthèse visa" = 2e bouton 2e rangée */
    let barre = [];
    for (const fr of page.frames()) barre = barre.concat(await fr.evaluate(() => Array.from(document.querySelectorAll('button, a, [role="button"], .btn, [ng-click]')).map(e => { const r = e.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), t: (e.getAttribute('title') || '').slice(0, 60) }; }).filter(o => o.w >= 24 && o.h >= 24 && o.w <= 90 && o.y > 60 && o.y < 240 && o.x > 400 && o.x < 1000)).catch(() => []));
    barre.sort((p, q) => (p.y - q.y) || (p.x - q.x));
    const rangs = []; barre.forEach(o => { const r = rangs.find(g => Math.abs(g.y - o.y) < 12); if (r) r.items.push(o); else rangs.push({ y: o.y, items: [o] }); });
    const btnCases = barre.find(o => /lectionner tous/i.test(o.t)) || (rangs[0] && rangs[0].items[0]);
    const r2 = rangs.find(g => g.items.length >= 4) || rangs[rangs.length - 1];
    const btnExcel = barre.find(o => /synth|visa|excel/i.test(o.t)) || (r2 && r2.items[1]);
    note('Boutons : cases=' + JSON.stringify(btnCases) + ' excel=' + JSON.stringify(btnExcel));
    const clic = async o => { await page.mouse.click(o.x + o.w / 2, o.y + o.h / 2); };
    /* Cases à cocher des lignes visibles : centre + état */
    const cases = async () => { let c = []; for (const fr of page.frames()) c = c.concat(await fr.evaluate(() => Array.from(document.querySelectorAll('input[type="checkbox"], [role="checkbox"], .k-checkbox, [class*="checkbox"]')).map(e => { const r = e.getBoundingClientRect(); const on = e.checked === true || e.getAttribute('aria-checked') === 'true' || /checked|selected|active/i.test(e.className); return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, on }; }).filter(o => o.w >= 10 && o.w <= 40 && o.y > 200 && o.y < 960 && o.x > 520 && o.x < 760)).catch(() => [])); return c; };
    const rapportPage = async (pg) => {
      let cs = await cases();
      if (!cs.length && btnCases) { await clic(btnCases); await page.waitForTimeout(1500); cs = await cases(); }
      if (!cs.length) { note('Page ' + pg + ' : aucune case à cocher visible'); return; }
      /* Cocher chaque fichier (défilement de la liste pour atteindre les lignes du bas) */
      let coches = 0;
      for (let tour = 0; tour < 12; tour++) {
        cs = await cases();
        const todo = cs.filter(c => !c.on);
        for (const c of todo) { await page.mouse.click(c.x, c.y); coches++; await page.waitForTimeout(120); }
        await page.mouse.move(900, 600); await page.mouse.wheel(0, 700); await page.waitForTimeout(500);
        const apres = await cases(); if (!apres.some(c => !c.on) && tour > 0 && apres.length === cs.length) break;
      }
      await page.mouse.wheel(0, -20000); await page.waitForTimeout(400);
      if (pg === 1) await page.screenshot({ path: path.join(CAP, '09-coches.png') }).catch(() => {});
      if (!btnExcel) { note('Icône Excel introuvable'); return; }
      const dlP = page.waitForEvent('download', { timeout: 240000 }).catch(() => null);
      await clic(btnExcel); await page.waitForTimeout(2000);
      /* Fenêtre "Options d'export" : tout sur Oui puis Générer le rapport */
      for (let k = 0; k < 3; k++) { const non = await bouton(page, 'text=/^Non$/'); if (!non) break; await non.click().catch(() => {}); await page.waitForTimeout(400); }
      if (pg === 1) await page.screenshot({ path: path.join(CAP, '10-options-export.png') }).catch(() => {});
      const gen = await bouton(page, 'button:has-text("Générer le rapport"), button:has-text("Générer"), text=/Générer le rapport/');
      if (gen) await gen.click().catch(() => {}); else note('Page ' + pg + ' : bouton "Générer le rapport" introuvable | ' + await texte());
      /* Génération : barre de progression, puis fichier (téléchargement direct ou lien à cliquer). On attend jusqu'à 4 min. */
      let dl = null; const debut = Date.now();
      while (!dl && Date.now() - debut < 240000) {
        dl = await Promise.race([dlP, page.waitForTimeout(3000).then(() => null)]);
        if (dl) break;
        const lien = await bouton(page, 'a[href*=".xls"], a[download], a:has-text("Télécharger"), button:has-text("Télécharger"), a:has-text("rapport")');
        if (lien) { note('Page ' + pg + ' : lien de téléchargement cliqué'); await lien.click().catch(() => {}); }
        if (pg === 1 && Date.now() - debut < 20000) await page.screenshot({ path: path.join(CAP, '11-generation.png') }).catch(() => {});
      }
      if (pg === 1) note('Page 1 : génération ' + Math.round((Date.now() - debut) / 1000) + ' s, fichier ' + (dl ? 'reçu' : 'ABSENT') + ' | ' + await texte());
      if (dl) {
        const f = path.join(DL, 'rapport-' + String(pg).padStart(3, '0') + '.xlsx'); await dl.saveAs(f); nbRapports++;
        if (pg === 1) fs.copyFileSync(f, path.join(CAP, 'rapport-page-1.xlsx'));
        try {
          const wb = XLSX.readFile(f); const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
          if (rows.length) { colonnesRapport = Object.keys(rows[0]); const kc = colonnesRapport.find(c => rows.some(r => /HMIMV-/i.test(String(r[c])))); rows.forEach(r => { const code = String(r[kc] || '').replace(/\.[a-z0-9]{2,5}$/i, '').split('_')[0].trim(); if (code) (histo[code] = histo[code] || []).push(r); }); }
          if (pg === 1) note('Rapport page 1 : ' + rows.length + ' lignes, colonnes = ' + colonnesRapport.join(' | '));
        } catch (e) { note('Lecture rapport page ' + pg + ' : ' + e.message); }
      } else note('Page ' + pg + ' : pas de téléchargement du rapport');
      /* Fermer la fenêtre si encore ouverte, puis décocher */
      const x = await bouton(page, 'button:has-text("×"), [aria-label="Close"], .close, button.k-dialog-close, text=/^×$/'); if (x) await x.click().catch(() => {});
      await page.keyboard.press('Escape').catch(() => {}); await page.waitForTimeout(500);
      for (let tour = 0; tour < 12; tour++) { const on = (await cases()).filter(c => c.on); for (const c of on) { await page.mouse.click(c.x, c.y); await page.waitForTimeout(100); } await page.mouse.wheel(0, 700); await page.waitForTimeout(400); if (!(await cases()).some(c => c.on) && tour > 0) break; }
      await page.mouse.wheel(0, -20000); await page.waitForTimeout(400);
    };
    for (let pg = 1; pg <= nbPages && pg <= 400; pg++) {
      if (pg > 1) {
        let ok = false;
        for (const fr of page.frames()) {
          const cand = fr.locator('a, li, span, button').filter({ hasText: new RegExp('^\\s*' + pg + '\\s*$') });
          const n = Math.min(await cand.count().catch(() => 0), 20);
          for (let i = n - 1; i >= 0; i--) { const l = cand.nth(i); const bb = await l.boundingBox().catch(() => null); if (bb && bb.y > 700 && await l.isVisible().catch(() => false)) { await l.click({ timeout: 5000 }).catch(() => {}); ok = true; break; } }
          if (ok) break;
        }
        if (!ok) { note('Page ' + pg + ' : bouton de pagination introuvable — arrêt'); break; }
        await page.waitForTimeout(2500); await attendreLoader();
        const attendu = ((pg - 1) * parPage + 1) + ' - ';
        for (let w = 0; w < 10; w++) { if ((await texte()).includes(attendu)) break; await page.waitForTimeout(1000); }
      }
      const rows = await lireVisible();
      rows.forEach(r => { if (r.html && exemples.length < 2) exemples.push(r.html); delete r.html; tous.set(r.fichier, r); });
      if (pg % 10 === 1) { note('Page ' + pg + '/' + nbPages + ' : ' + rows.length + ' lignes, cumul ' + tous.size); await page.screenshot({ path: path.join(CAP, '08-page-' + String(pg).padStart(3, '0') + '.png') }).catch(() => {}); }
      if (!rows.length) { note('Page ' + pg + ' vide — arrêt'); break; }
      try { await rapportPage(pg); } catch (e) { note('Rapport page ' + pg + ' : ' + e.message); await page.keyboard.press('Escape').catch(() => {}); }
    }
    note('Rapports téléchargés : ' + nbRapports + ', documents avec historique : ' + Object.keys(histo).length);
    fs.writeFileSync(path.join(CAP, 'exemples-lignes.html'), exemples.join('\n\n<!-- ---- -->\n\n'));
    note('Lecture terminée : ' + tous.size + ' documents');
    if (!tous.size) throw new Error('Aucune ligne lue à l\'écran — voir exemples-lignes.html et captures 08-*');

    /* 4. Normalisation — couleur des pastilles : vert = validé, orange = avec observations, rouge = refusé, gris = en attente */
    const rgb = s => { const m = String(s).match(/(\d+)[, ]+(\d+)[, ]+(\d+)/); return m ? [+m[1], +m[2], +m[3]] : [128, 128, 128]; };
    const avisCouleur = (bg, fg) => { let [r, g, b] = rgb(bg); if (Math.max(r, g, b) - Math.min(r, g, b) < 40) [r, g, b] = rgb(fg); const sat = Math.max(r, g, b) - Math.min(r, g, b); if (sat < 40) return 'ATT'; if (g > r && g > b) return 'VSO'; if (r > 180 && g > 110 && b < 120) return 'VAO'; if (r > 150 && g < 110) return 'REF'; return 'ATT'; };
    const out = [];
    for (const r of tous.values()) {
      const brut = r.fichier.replace(/\.[a-z0-9]{2,5}$/i, '');
      const code = brut.split('_')[0].trim(), p = code.split('-');
      const visas = r.badges.filter(bd => !/^Lot /.test(bd.t)).map(bd => ({ k: (bd.t.match(/^\d{2}-([A-Z]{2,4})/) || ['', bd.t.slice(0, 3)])[1], lab: bd.t, avis: avisCouleur(bd.bg, bd.fg), couleur: bd.bg, info: bd.title }));
      const lotB = r.badges.find(bd => /^Lot /.test(bd.t));
      const [dd, mm, yy] = (r.date || '').split('/');
      out.push({ code, fichier: r.fichier, titre: r.desc || brut, phase: (p[1] || '').toUpperCase(), lot: p[3] || (lotB ? (lotB.t.match(/\d+/) || [''])[0] : ''), type: p[4] || '', bat: (p[5] || '').toUpperCase(), zone: p[6] || '', niveau: p[7] || '', indice: String(p[9] || '00').padStart(2, '0'), emetteur: r.emetteur, date: yy ? new Date(+yy, +mm - 1, +dd).toISOString() : '', lotLab: lotB ? lotB.t : '', lotAvis: lotB ? avisCouleur(lotB.bg, lotB.fg) : '', visas, historique: histo[code] || [] });
    }
    fs.writeFileSync(path.join(__dirname, '..', 'kairnial.json'), JSON.stringify({ ok: true, date: new Date().toISOString(), total, colonnesRapport, docs: out }));
    console.log(out.length + ' documents lus');
  } catch (e) {
    await page.screenshot({ path: path.join(CAP, '99-erreur.png') }).catch(() => {});
    note('ÉCHEC : ' + e.message);
    console.error('Échec : ' + e.message); process.exitCode = 1;
  } finally { note('API captées (fin) : ' + JSON.stringify(api)); fs.writeFileSync(path.join(CAP, 'journal.txt'), journal.join('\n')); await browser.close(); }
})();
