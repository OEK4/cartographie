/* Robot Kairnial — se connecte avec VOTRE login (secrets GitHub), exporte la liste des documents, écrit kairnial.json. */
const { chromium } = require('playwright');
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const URL = process.env.KAIRNIAL_URL, LOGIN = process.env.KAIRNIAL_LOGIN, PASS = process.env.KAIRNIAL_PASSWORD, PROJET = process.env.KAIRNIAL_PROJET || '';
if (!URL || !LOGIN || !PASS) { console.error('Secrets KAIRNIAL_URL / KAIRNIAL_LOGIN / KAIRNIAL_PASSWORD manquants'); process.exit(1); }
const CAP = path.join(__dirname, 'captures'); fs.mkdirSync(CAP, { recursive: true });
const DL = path.join(__dirname, 'dl'); fs.mkdirSync(DL, { recursive: true });

/* Premier élément présent parmi plusieurs repères possibles. */
async function premier(page, sels, t = 15000) {
  const fin = Date.now() + t;
  while (Date.now() < fin) {
    for (const s of sels) { const l = page.locator(s).first(); if (await l.count() && await l.isVisible().catch(() => false)) return l; }
    await page.waitForTimeout(300);
  }
  throw new Error('Repère introuvable : ' + sels.join(' | '));
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ acceptDownloads: true, locale: 'fr-FR', viewport: { width: 1600, height: 1000 } });
  const page = await ctx.newPage();
  try {
    /* 1. Connexion — Kairnial affiche "Please wait…" puis redirige vers la page de connexion (identifiant, puis mot de passe) */
    await page.goto(URL, { waitUntil: 'domcontentloaded' });
    await page.locator('text=/Please wait|Veuillez patienter/i').first().waitFor({ state: 'hidden', timeout: 60000 }).catch(() => {});
    const user = await premier(page, ['#username', 'input[name="username"]', 'input[placeholder*="Identifiant" i]', 'input[type="email"]', 'input[name*="login" i]', 'input[name*="user" i]', 'input[type="text"]'], 60000);
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(CAP, '01-login.png') });
    await user.fill(LOGIN, { timeout: 15000 }).catch(async () => { await user.click({ force: true }); await page.keyboard.type(LOGIN); });
    const btn1 = page.locator('#kc-login, button:has-text("Connexion"), input[type="submit"], button[type="submit"], button:has-text("Login"), button:has-text("Suivant"), button:has-text("Continuer")').first();
    if (await btn1.count()) await btn1.click({ timeout: 10000 }).catch(() => page.keyboard.press('Enter')); else await page.keyboard.press('Enter');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: path.join(CAP, '02-apres-identifiant.png') });
    const pwd = await premier(page, ['#password', 'input[name="password"]', 'input[type="password"]'], 60000);
    await pwd.fill(PASS, { timeout: 15000 }).catch(async () => { await pwd.click({ force: true }); await page.keyboard.type(PASS); });
    const btn2 = page.locator('#kc-login, button:has-text("Connexion"), input[type="submit"], button[type="submit"], button:has-text("Login"), button:has-text("Se connecter")').first();
    if (await btn2.count()) await btn2.click({ timeout: 10000 }).catch(() => page.keyboard.press('Enter')); else await page.keyboard.press('Enter');
    await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {});
    await page.locator('text=/Please wait|Veuillez patienter/i').first().waitFor({ state: 'hidden', timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(4000);
    await page.screenshot({ path: path.join(CAP, '03-apres-connexion.png') });
    if (await page.locator('input[type="password"]').first().isVisible().catch(() => false)) throw new Error('Connexion refusée (identifiant ou mot de passe)');
    /* Revenir sur la liste des fichiers si Kairnial a atterri ailleurs */
    if (!/rfiles/.test(page.url())) { await page.goto(URL, { waitUntil: 'domcontentloaded' }); await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {}); await page.waitForTimeout(4000); }

    /* 2. Projet HMIMV puis liste des fichiers (si l'URL n'y mène pas déjà) */
    await page.screenshot({ path: path.join(CAP, '04-accueil.png') });
    if (PROJET) { const p = page.locator('text=' + PROJET).first(); if (await p.isVisible().catch(() => false)) { await p.click(); await page.waitForLoadState('networkidle').catch(() => {}); await page.waitForTimeout(2000); } }
    if (!/rfiles/.test(page.url())) { const docs = page.locator('a:has-text("Documents"), a:has-text("Fichiers"), text=Documents, [href*="rfiles"]').first(); if (await docs.isVisible().catch(() => false)) { await docs.click(); await page.waitForLoadState('networkidle').catch(() => {}); await page.waitForTimeout(2000); } }
    await page.screenshot({ path: path.join(CAP, '05-documents.png') });

    /* 3. Export Excel */
    const exp = await premier(page, ['button:has-text("Exporter")', 'button:has-text("Export")', '[title*="Export" i]', '[aria-label*="Export" i]', 'text=/^Export/i'], 30000);
    const [dl] = await Promise.all([
      page.waitForEvent('download', { timeout: 120000 }),
      exp.click().then(async () => { const x = page.locator('text=/Excel|xlsx|CSV/i').first(); if (await x.count()) await x.click().catch(() => {}); })
    ]);
    const file = path.join(DL, dl.suggestedFilename() || 'export.xlsx');
    await dl.saveAs(file);

    /* 4. Lecture et normalisation */
    const wb = XLSX.readFile(file);
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
    if (!rows.length) throw new Error('Export vide');
    const cols = Object.keys(rows[0]);
    const col = re => cols.find(c => re.test(c.normalize('NFD').replace(/[\u0300-\u036f]/g, ''))) || '';
    const C = { code: col(/^(code|nom|name|reference|fichier|document)/i), titre: col(/titre|title|description|designation/i), indice: col(/indice|revision|version/i), emetteur: col(/emetteur|auteur|author|depose par|uploaded/i), date: col(/date/i), etat: col(/etat|statut|status/i) };
    const visaCols = cols.filter(c => /BCT|BSI|LUS|visa|avis/i.test(c) && c !== C.etat);
    const avis = v => { const a = String(v || '').toUpperCase(); return !a ? 'ATT' : /REF|DEFAV|REJ/.test(a) ? 'REF' : /VAO|OBS|RESERV/.test(a) ? 'VAO' : /VSO|VALID|FAVOR|APPROUV|APPROV/.test(a) ? 'VSO' : /NON CONCERN|^NC$|N\/A/.test(a) ? 'NC' : /ATTENTE|PENDING|EN COURS/.test(a) ? 'ATT' : 'ATT'; };
    const out = rows.map(r => {
      const brut = String(r[C.code] || '').replace(/\.[a-z0-9]{2,5}$/i, '');
      const code = brut.split('_')[0].trim();
      const p = code.split('-');
      const visas = visaCols.map(c => ({ k: (c.match(/BCT|BSI|LUS/i) || [c.slice(0, 3)])[0].toUpperCase(), avis: avis(r[c]) }));
      return { code, titre: String(r[C.titre] || brut), lot: p[3] || '', type: p[4] || '', bat: p[5] || '', niveau: p[7] || '', indice: String(r[C.indice] || p[9] || '00').padStart(2, '0'), emetteur: String(r[C.emetteur] || ''), date: r[C.date] ? new Date(r[C.date]).toISOString() : '', etat: r[C.etat] ? avis(r[C.etat]) : undefined, visas };
    }).filter(d => /^HMIMV-/i.test(d.code));
    if (!out.length) throw new Error('Aucun code HMIMV reconnu — colonnes : ' + cols.join(', '));
    fs.writeFileSync(path.join(__dirname, '..', 'kairnial.json'), JSON.stringify({ ok: true, date: new Date().toISOString(), colonnes: cols, docs: out }));
    console.log(out.length + ' documents exportés');
  } catch (e) {
    await page.screenshot({ path: path.join(CAP, '99-erreur.png') }).catch(() => {});
    console.error('Échec : ' + e.message); process.exitCode = 1;
  } finally { await browser.close(); }
})();
