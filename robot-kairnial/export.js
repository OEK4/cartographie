/* Robot Kairnial — se connecte avec VOTRE login (secrets GitHub), exporte la liste des documents, écrit kairnial.json. */
const { chromium } = require('playwright');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const KURL = process.env.KAIRNIAL_URL, LOGIN = process.env.KAIRNIAL_LOGIN, PASS = process.env.KAIRNIAL_PASSWORD, PROJET = process.env.KAIRNIAL_PROJET || '';
if (!KURL || !LOGIN || !PASS) { console.error('Secrets KAIRNIAL_URL / KAIRNIAL_LOGIN / KAIRNIAL_PASSWORD manquants'); process.exit(1); }
const CAP = path.join(__dirname, 'captures'); fs.mkdirSync(CAP, { recursive: true });
const DL = path.join(__dirname, 'dl'); fs.mkdirSync(DL, { recursive: true });

async function premier(page, sels, t = 15000) {
  const fin = Date.now() + t;
  while (Date.now() < fin) {
    for (const s of sels) for (const fr of page.frames()) {
      const n = Math.min(await fr.locator(s).count().catch(() => 0), 15);
      for (let i = 0; i < n; i++) { const l = fr.locator(s).nth(i); if (await l.isVisible().catch(() => false)) { l._repere = s; return l; } }
    }
    await page.waitForTimeout(300);
  }
  throw new Error('Repère introuvable : ' + sels.join(' | '));
}
async function bouton(page, sel) {
  for (const fr of page.frames()) {
    const n = Math.min(await fr.locator(sel).count().catch(() => 0), 15);
    for (let i = 0; i < n; i++) { const l = fr.locator(sel).nth(i); if (await l.isVisible().catch(() => false)) return l; }
  }
  return null;
}

const journal = [];
const note = m => { journal.push(new Date().toISOString().slice(11, 19) + ' ' + m); };

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ acceptDownloads: true, locale: 'fr-FR', viewport: { width: 1600, height: 1000 } });
  let page = await ctx.newPage();
  ctx.on('page', async p => { try { await p.waitForLoadState('domcontentloaded'); page = p; note('Nouvel onglet : ' + p.url().slice(0, 60)); } catch (e) {} });
  const ou = () => { try { const u = new URL(page.url()); return u.host + u.pathname + u.hash.slice(0, 40); } catch (e) { return '?'; } };
  const texte = async () => { let s = ''; for (const fr of page.frames()) s += ' ' + (await fr.evaluate(() => (document.body && document.body.innerText) || '').catch(() => '')); return s.replace(/\s+/g, ' ').slice(0, 400); };
  const attendreLoader = async (t = 60000) => { const fin = Date.now() + t; while (Date.now() < fin) { let vis = false; for (const fr of page.frames()) for (const e of await fr.locator('text=/Veuillez patienter|Please wait/i').all().catch(() => [])) if (await e.isVisible().catch(() => false)) { vis = true; break; } if (!vis) return; await page.waitForTimeout(300); } };
  try {
    /* 1. Connexion */
    await page.goto(KURL, { waitUntil: 'domcontentloaded' });
    await attendreLoader();
    const SEL_USER = ['input[placeholder*="Identifiant" i]', '#username', 'input[name="username"]', 'input[type="email"]', 'input[name*="login" i]', 'input[name*="user" i]', 'input[placeholder*="mail" i]', 'form input[type="text"]'];
    const SEL_PWD = ['#password', 'input[name="password"]', 'input[type="password"]'];
    const user = await premier(page, SEL_USER, 60000);
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

    /* 2. Projet HMIMV puis liste des fichiers */
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
    const diag = async (tag) => { const d = []; for (const fr of page.frames()) { const i = await fr.evaluate(() => ({ u: location.href.slice(0, 70), inputs: document.querySelectorAll('input').length, boutons: document.querySelectorAll('button,[role="button"]').length, shadow: Array.from(document.querySelectorAll('*')).filter(e => e.shadowRoot).length, texte: (document.body && document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 120) })).catch(() => null); if (i) d.push(JSON.stringify(i)); } note('DIAG ' + tag + ' : ' + d.join(' ## ')); };
    const listeOK = async () => !!(await bouton(page, 'text=Derniers items, text=Mes fichiers, input[placeholder*="Recherche" i]'));
    if (!(await listeOK())) {
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

    /* 3. Export Excel — l'icône Excel n'a ni texte ni info-bulle : inventaire de la barre d'outils, puis choix par icône ou par position (2e bouton de la 2e rangée). */
    let barre = [];
    for (const fr of page.frames()) barre = barre.concat(await fr.evaluate(() => Array.from(document.querySelectorAll('button, a, [role="button"], .btn')).map(e => { const r = e.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), html: e.outerHTML.replace(/\s+/g, ' ').slice(0, 220) }; }).filter(o => o.w >= 24 && o.h >= 24 && o.w <= 90 && o.y > 60 && o.y < 240 && o.x > 400 && o.x < 1000)).catch(() => []));
    barre.sort((p, q) => (p.y - q.y) || (p.x - q.x));
    note('Barre d\'outils (' + barre.length + ') : ' + barre.map(o => o.x + ',' + o.y + ' ' + o.html.replace(/"/g, "'")).join(' || '));
    let cible = barre.find(o => /excel|xls|file-export|export/i.test(o.html));
    if (!cible && barre.length) {
      const rangs = []; barre.forEach(o => { const r = rangs.find(g => Math.abs(g.y - o.y) < 12); if (r) r.items.push(o); else rangs.push({ y: o.y, items: [o] }); });
      const r2 = rangs.find(g => g.items.length >= 4) || rangs[rangs.length - 1];
      cible = r2 && (r2.items[1] || r2.items[0]);
      note('Bouton Excel choisi par position : ' + (cible ? cible.x + ',' + cible.y : 'aucun'));
    } else if (cible) note('Bouton Excel reconnu : ' + cible.html.slice(0, 120));
    if (!cible) throw new Error('Barre d\'outils introuvable — voir journal "Barre d\'outils"');
    const [dl] = await Promise.all([
      page.waitForEvent('download', { timeout: 180000 }),
      page.mouse.click(cible.x + cible.w / 2, cible.y + cible.h / 2).then(async () => {
        for (let n = 0; n < 8; n++) {
          await page.waitForTimeout(2000);
          await page.screenshot({ path: path.join(CAP, '07-export-' + n + '.png') }).catch(() => {});
          note('Après clic export ' + n + ' : ' + await texte());
          const x = await bouton(page, 'button:has-text("Exporter"), button:has-text("Export"), button:has-text("Valider"), button:has-text("Télécharger"), button:has-text("OK"), button:has-text("Confirmer"), button:has-text("Oui"), a:has-text("Exporter"), text=/Excel|xlsx/i');
          if (x) { note('Confirmation export : ' + (await x.innerText().catch(() => '?'))); await x.click().catch(() => {}); } else break;
        }
      })
    ]);
    const file = path.join(DL, dl.suggestedFilename() || 'export.xlsx');
    await dl.saveAs(file);

    /* 4. Lecture et normalisation */
    const wb = XLSX.readFile(file);
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
    if (!rows.length) throw new Error('Export vide');
    const cols = Object.keys(rows[0]);
    const col = re => cols.find(c => re.test(c.normalize('NFD').replace(/[\u0300-\u036f]/g, ''))) || '';
    const C = { code: col(/^(code|nom|name|reference|fichier|document)/i), titre: col(/titre|title|description|designation/i), indice: col(/indice|revision|version/i), emetteur: col(/emetteur|auteur|author|depose par|uploaded/i), date: col(/date/i), etat: col(/etat|statut|status/i), dossier: col(/dossier|chemin|folder|path|repertoire/i) };
    const visaCols = cols.filter(c => /BCT|BSI|LUS|visa|avis/i.test(c) && c !== C.etat);
    const avis = v => { const a = String(v || '').toUpperCase(); return !a ? 'ATT' : /REF|DEFAV|REJ/.test(a) ? 'REF' : /VAO|OBS|RESERV/.test(a) ? 'VAO' : /VSO|VALID|FAVOR|APPROUV|APPROV/.test(a) ? 'VSO' : /NON CONCERN|^NC$|N\/A/.test(a) ? 'NC' : /ATTENTE|PENDING|EN COURS/.test(a) ? 'ATT' : 'ATT'; };
    const out = rows.map(r => {
      const brut = String(r[C.code] || '').replace(/\.[a-z0-9]{2,5}$/i, '');
      const code = brut.split('_')[0].trim();
      const p = code.split('-');
      const visas = visaCols.map(c => ({ k: (c.match(/BCT|BSI|LUS/i) || [c.slice(0, 3)])[0].toUpperCase(), avis: avis(r[c]) }));
      const dossier = String(r[C.dossier] || '');
      const phase = (p[1] || '').toUpperCase() || ((dossier.match(/\b(EXE|APD|APS|MARCHE|MARCHÉ|REFERENCE|RÉFÉRENCE)\b/i) || ['', ''])[1].toUpperCase());
      return { code, titre: String(r[C.titre] || brut), phase, dossier, lot: p[3] || '', type: p[4] || '', bat: (p[5] || '').toUpperCase(), zone: p[6] || '', niveau: p[7] || '', indice: String(r[C.indice] || p[9] || '00').padStart(2, '0'), emetteur: String(r[C.emetteur] || ''), date: r[C.date] ? new Date(r[C.date]).toISOString() : '', etat: r[C.etat] ? avis(r[C.etat]) : undefined, visas };
    }).filter(d => /^HMIMV-/i.test(d.code));
    if (!out.length) throw new Error('Aucun code HMIMV reconnu — colonnes : ' + cols.join(', '));
    fs.writeFileSync(path.join(__dirname, '..', 'kairnial.json'), JSON.stringify({ ok: true, date: new Date().toISOString(), colonnes: cols, docs: out }));
    console.log(out.length + ' documents exportés');
  } catch (e) {
    await page.screenshot({ path: path.join(CAP, '99-erreur.png') }).catch(() => {});
    note('ÉCHEC : ' + e.message);
    console.error('Échec : ' + e.message); process.exitCode = 1;
  } finally { fs.writeFileSync(path.join(CAP, 'journal.txt'), journal.join('\n')); await browser.close(); }
})();
