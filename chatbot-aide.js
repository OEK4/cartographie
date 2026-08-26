/* Assistant d'aide NHM — bulle flottante, design capsule Bymaro (orange / pilule blanche / noir).
   Web component autonome : <nhm-chatbot app="Saisie terrain"></nhm-chatbot>
   Moteur : window.claude.complete si présent, sinon API Anthropic avec la clé saisie (⚙, stockée sur ce poste). */
(function () {
  if (customElements.get('nhm-chatbot')) return;
  var DEFAUT_CLE = atob('QVEuQWI4Uk42SmVKaTQ0b3NVellIX2xiS0hzeW90SlhWTEl3a0lVeVBCcnpMZVE1blAwV0E=');
  var MODELE = 'claude-3-5-haiku-latest';
  var SPN = 11;

  var GUIDE = [
    "Tu es l'assistant du dispositif de suivi d'avancement CET du chantier NHM (Nouvel Hôpital Militaire, HMIMV Rabat), développé par l'équipe CET Bymaro (groupe Bouygues).",
    'Interfaces : 1) SAISIE TERRAIN : pointage local par local, par spécialité (CDC, SSI, CFO, CFA, évacuation PVC, alimentation PPR, hydraulique CPVC, aéraulique, désenfumage, SPK, RIA). Clic sur une puce = spécialité pointée ; double-clic = non existant dans ce local (exclue du calcul) ; l\u2019avancement du local est la moyenne des spécialités existantes. Bouton ENVOYER : publie les saisies (vals.json) et dépose un journal d\u2019envoi pour vérification.',
    '2) RÉSULTATS : contrôle hebdomadaire S-1 / S / S+1 par zone et spécialité. Bouton « Envois reçus » : chaque envoi de la saisie terrain y est vérifié LOCAL PAR LOCAL — Valider confirme, Rejeter rétablit la version précédente du local et transmet le motif à l\u2019opérateur (il le voit à l\u2019ouverture de la saisie terrain). Clôture hebdomadaire = version archivée (historique). Exports JSON / CSV Power BI / Effectifs.',
    '3) CARTOGRAPHIE DES LOCAUX : plans par bâtiment (SSP, SMT, TSG, CDI) et par niveau, zones colorées selon l\u2019avancement.',
    '4) DASHBOARD / PRÉSENTATION : synthèse, courbes en S théorique vs réel, génération PowerPoint en ligne (bouton « Générer et mettre en ligne »).',
    'Procédures et erreurs courantes : si un envoi n\u2019arrive pas, ouvrir le panneau PowerPoint > Diagnostic (vérifie l\u2019URL du script, l\u2019accès au fichier, les derniers envois). Causes fréquentes : déploiement Apps Script pas en « Nouvelle version », accès pas en « tout le monde », mauvais FILE_ID. Une saisie rejetée est rétablie automatiquement : récupérer les données puis corriger et renvoyer.',
    'ACTION : depuis la Saisie terrain, tu sais localiser un local — si on te demande de trouver / chercher / localiser un local, la recherche se déclenche automatiquement et propose des boutons cliquables qui ouvrent le local dans la saisie.',
    'Réponds en français, bref et concret (2-6 phrases), en t\u2019appuyant sur les données ci-dessous quand on te demande un avancement. Si une info manque, dis-le simplement.'
  ].join('\n');

  function lireJSON(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }

  function digestAvancement() {
    var v = lireJSON('tableauLocauxNiveaux.v1') || {};
    var locaux = {};
    function loc(P, i) { var c = P.slice(i, i + 3).join('|'); return (locaux[c] = locaux[c] || { spv: {}, spx: {}, sp: undefined, plan: '' }); }
    for (var k in v) {
      var P = k.split('|');
      if (P[0] === 'spv') loc(P, 1).spv[P[4]] = parseInt(v[k], 10) || 0;
      else if (P[0] === 'spx') loc(P, 1).spx[P[4]] = 1;
      else if (P[0] === 'sp') loc(P, 1).sp = parseInt(v[k], 10) || 0;
      else if (P[0] === 'plan' && P[1] === 'nombre') loc(P, 2).plan = v[k];
    }
    var parNiv = {};
    for (var c in locaux) {
      var o = locaux[c], pct = null;
      var nx = Object.keys(o.spx).length, nv = Object.keys(o.spv).length;
      if (nv || nx) {
        var nEx = SPN - nx, s = 0;
        for (var sp in o.spv) if (!o.spx[sp]) s += o.spv[sp];
        pct = nEx > 0 ? Math.round(s / nEx) : 0;
      } else if (o.sp !== undefined) pct = o.sp;
      else if (o.plan === 'f') pct = 100;
      else if (o.plan === 'e') pct = 50;
      if (pct === null) continue;
      var nk = c.split('|').slice(0, 2).join(' ');
      (parNiv[nk] = parNiv[nk] || { n: 0, s: 0, fin: 0 });
      parNiv[nk].n++; parNiv[nk].s += pct; if (pct >= 75) parNiv[nk].fin++;
    }
    var lignes = Object.keys(parNiv).sort().map(function (k2) {
      var e = parNiv[k2];
      return k2 + ' : ' + e.n + ' locaux pointés · moyenne ' + Math.round(e.s / e.n) + ' % · ' + e.fin + ' finis (>=75%)';
    });
    return lignes.length ? 'AVANCEMENT POINTÉ SUR CE POSTE (bâtiment niveau) :\n' + lignes.join('\n') : 'Aucun pointage enregistré sur ce poste pour l\u2019instant.';
  }

  function digestProfils() {
    var out = [];
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k.indexOf('saisieTerrain.prof') !== 0) continue;
        var nom = k.split('.').slice(2).join('.') || '';
        var p = lireJSON(k) || {};
        if (nom || p.role || p.tel || p.mail) out.push('- ' + (nom || '?') + (p.role ? ' · ' + p.role : '') + (p.tel ? ' · ' + p.tel : '') + (p.mail ? ' · ' + p.mail : ''));
      }
    } catch (e) {}
    return out.length ? 'CONTACTS / PROFILS OPÉRATEURS CONNUS SUR CE POSTE :\n' + out.join('\n') : '';
  }

  function systeme(app) {
    return GUIDE + '\n\nINTERFACE OUVERTE ACTUELLEMENT : ' + (app || 'suivi CET') +
      '\nDate : ' + new Date().toLocaleString('fr-FR') + '\n\n' + digestAvancement() + '\n\n' + digestProfils();
  }

  var CSS = [
    ':host{all:initial}',
    '*{box-sizing:border-box;font-family:"Archivo Narrow","Segoe UI",sans-serif}',
    '@keyframes flotte{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}',
    '@keyframes pulse{0%{box-shadow:0 0 0 0 rgba(233,83,29,.45)}100%{box-shadow:0 0 0 16px rgba(233,83,29,0)}}',
    '@keyframes pop{from{opacity:0;transform:translateY(14px) scale(.97)}to{opacity:1;transform:none}}',
    '@keyframes pt{0%,80%,100%{transform:scale(.6);opacity:.4}40%{transform:scale(1);opacity:1}}',
    '.bulle{position:fixed;right:18px;bottom:18px;z-index:99990;width:66px;height:66px;border:2.5px solid #E9531D;cursor:pointer;background:#FFFFFF;border-radius:50%;display:flex;align-items:center;justify-content:center;animation:flotte 3.2s ease-in-out infinite,pulse 2.4s ease-out infinite;transition:transform .18s;padding:0}',
    '.bulle:hover{transform:scale(1.09) rotate(-4deg)}',
    '.bulle svg{display:block;margin-top:2px}',
    '.pan{position:fixed;right:18px;bottom:82px;z-index:99991;width:min(378px,94vw);height:min(560px,74vh);background:#FFFFFF;border-radius:22px;box-shadow:0 22px 60px rgba(17,17,17,.35);display:flex;flex-direction:column;overflow:hidden;animation:pop .22s ease-out}',
    '.tete{background:#E9531D;padding:12px 14px;display:flex;align-items:center;gap:9px}',
    '.tete .avr{width:38px;height:38px;border-radius:50%;background:#FFFFFF;display:flex;align-items:center;justify-content:center;flex:none}',
    '.tete .cap{background:#FFFFFF;border-radius:14px;padding:4px 12px;font-size:13.5px;font-weight:800;letter-spacing:.05em;color:#111111;white-space:nowrap}',
    '.tete .sous{flex:1;font-size:11.5px;color:rgba(255,255,255,.92);font-weight:600;line-height:1.25}',
    '.tete button{width:28px;height:28px;border:none;border-radius:50%;background:rgba(17,17,17,.22);color:#FFFFFF;font-size:13px;cursor:pointer;flex:none}',
    '.tete button:hover{background:rgba(17,17,17,.4)}',
    '.cfg{background:#111111;padding:10px 14px;display:flex;flex-direction:column;gap:7px}',
    '.cfg label{font-size:11px;color:#C9C5BD;letter-spacing:.04em}',
    '.cfg .lig{display:flex;gap:6px}',
    '.cfg input{flex:1;border:1px solid #3A3A3A;border-radius:12px;background:#1D1D1D;color:#FFFFFF;padding:7px 11px;font-size:12.5px;outline:none}',
    '.cfg .ok{border:none;border-radius:12px;background:#E9531D;color:#FFFFFF;font-weight:700;font-size:12.5px;padding:0 14px;cursor:pointer}',
    '.fil{flex:1;overflow-y:auto;padding:13px 12px;display:flex;flex-direction:column;gap:9px;background:#F5F3EF}',
    '.msg{max-width:84%;padding:8px 13px;border-radius:17px;font-size:13.5px;line-height:1.45;white-space:pre-wrap;word-break:break-word}',
    '.msg.u{align-self:flex-end;background:#111111;color:#FFFFFF;border-bottom-right-radius:6px}',
    '.msg.b{align-self:flex-start;background:#FFFFFF;color:#1B1B1B;border:1.5px solid #E9531D;border-bottom-left-radius:6px}',
    '.msg.e{align-self:flex-start;background:#FDEBE4;color:#A33312;border:1px solid #E9531D;font-size:12.5px}',
    '.tape{align-self:flex-start;display:flex;gap:4px;padding:10px 14px;background:#FFFFFF;border:1.5px solid #E9531D;border-radius:17px;border-bottom-left-radius:6px}',
    '.tape i{width:7px;height:7px;border-radius:50%;background:#E9531D;animation:pt 1.1s infinite}',
    '.tape i:nth-child(2){animation-delay:.18s}.tape i:nth-child(3){animation-delay:.36s}',
    '.sugg{display:flex;flex-wrap:wrap;gap:6px;padding:0 12px 8px;background:#F5F3EF}',
    '.sugg button{border:1.5px solid #E9531D;background:#FFFFFF;color:#A33312;border-radius:15px;padding:5px 11px;font-size:11.5px;font-weight:700;cursor:pointer}',
    '.sugg button:hover{background:#E9531D;color:#FFFFFF}',
    '.pied{display:flex;gap:7px;padding:10px 12px;background:#FFFFFF;border-top:1px solid #EBE7E0}',
    '.pied textarea{flex:1;resize:none;border:1.5px solid #D8D3CA;border-radius:16px;padding:8px 13px;font-size:13.5px;height:38px;outline:none;line-height:1.4}',
    '.pied textarea:focus{border-color:#E9531D}',
    '.pied button{width:44px;height:38px;border:none;border-radius:19px;background:#E9531D;color:#FFFFFF;font-size:16px;cursor:pointer;flex:none;font-weight:800}',
    '.pied button:disabled{opacity:.5;cursor:default}'
  ].join('\n');

  var SUGG = ['Comment pointer une spécialité ?', 'Où en est l\u2019avancement ?', 'Mon envoi n\u2019arrive pas', 'À quoi sert Rejeter ?'];

  // Robot EPI : casque + gilet orange Bymaro, logo capsule sur les deux
  function ROBOT(px) {
    return '<svg viewBox="0 0 64 64" width="' + px + '" height="' + px + '" aria-hidden="true">' +
      '<line x1="32" y1="6" x2="32" y2="12" stroke="#111111" stroke-width="2"/>' +
      '<circle cx="32" cy="5" r="2.7" fill="#E9531D"/>' +
      '<path d="M15 24 a17 14 0 0 1 34 0 z" fill="#E9531D"/>' +
      '<rect x="12" y="23" width="40" height="4.6" rx="2.3" fill="#E9531D"/>' +
      '<rect x="25.2" y="15.8" width="13.6" height="6.6" rx="3.3" fill="#FFFFFF"/>' +
      '<rect x="27.9" y="17.6" width="8.2" height="3" rx="1.5" fill="#E9531D"/>' +
      '<rect x="14.5" y="31.5" width="4" height="7.5" rx="2" fill="#C9C5BD"/>' +
      '<rect x="45.5" y="31.5" width="4" height="7.5" rx="2" fill="#C9C5BD"/>' +
      '<rect x="18" y="27.6" width="28" height="16" rx="7" fill="#3A3A3A"/>' +
      '<circle cx="26.5" cy="35" r="3" fill="#7FE7FF"/>' +
      '<circle cx="37.5" cy="35" r="3" fill="#7FE7FF"/>' +
      '<rect x="27.5" y="39.6" width="9" height="1.8" rx="0.9" fill="#9A9A9A"/>' +
      '<rect x="29" y="43.4" width="6" height="3.8" fill="#C9C5BD"/>' +
      '<path d="M20 47 h24 l3.4 13 h-30.8 z" fill="#E9531D"/>' +
      '<path d="M22.6 47 h4 l1.3 13 h-4 z" fill="#E6E6E6"/>' +
      '<path d="M37.4 47 h4 l1.3 13 h-4 z" fill="#E6E6E6"/>' +
      '<rect x="27.2" y="51" width="9.6" height="4.8" rx="2.4" fill="#FFFFFF"/>' +
      '<rect x="29.1" y="52.35" width="5.8" height="2.1" rx="1.05" fill="#E9531D"/>' +
      '</svg>';
  }

  class NHMChatbot extends HTMLElement {
    connectedCallback() {
      if (this._fait) return; this._fait = true;
      this.app = this.getAttribute('app') || document.title || 'Suivi CET';
      this.hist = [];
      var r = this.attachShadow({ mode: 'open' });
      r.innerHTML = '<style>' + CSS + '</style>' +
        '<button class="bulle" title="Assistant d\u2019aide">' + ROBOT(52) + '</button>' +
        '<div class="pan" style="display:none">' +
        '<div class="tete"><div class="avr">' + ROBOT(30) + '</div><div class="sous"><b style="font-size:13.5px;letter-spacing:.05em">NHM · ASSISTANT</b><br>' + this.app + ' · équipe CET Bymaro</div>' +
        (DEFAUT_CLE ? '' : '<button class="bcfg" title="Clé API">⚙</button>') + '<button class="bx" title="Fermer">✕</button></div>' +
        (DEFAUT_CLE ? '' : '<div class="cfg" style="display:none"><label>Clé API Anthropic (stockée uniquement sur ce poste)</label>' +
        '<div class="lig"><input type="password" placeholder="sk-ant-…"><button class="ok">OK</button></div></div>') +
        '<div class="fil"></div>' +
        '<div class="sugg">' + SUGG.map(function (s, i) { return '<button data-i="' + i + '">' + s + '</button>'; }).join('') + '</div>' +
        '<div class="pied"><textarea rows="1" placeholder="Poser une question…"></textarea><button class="env">➤</button></div></div>';
      var q = function (s2) { return r.querySelector(s2); };
      this.$pan = q('.pan'); this.$fil = q('.fil'); this.$ta = q('textarea'); this.$env = q('.env'); this.$cfg = q('.cfg'); this.$cle = q('.cfg input');
      var self = this;
      q('.bulle').onclick = function () {
        var on = self.$pan.style.display !== 'none';
        self.$pan.style.display = on ? 'none' : 'flex';
        if (!on && !self.hist.length) self.bot('Bonjour ! Je suis l\u2019assistant du suivi CET. Je peux expliquer les interfaces, lire l\u2019avancement pointé sur ce poste, ou aider en cas d\u2019erreur d\u2019envoi.');
        if (!on) self.$ta.focus();
      };
      q('.bx').onclick = function () { self.$pan.style.display = 'none'; };
      if (q('.bcfg')) q('.bcfg').onclick = function () {
        self.$cfg.style.display = self.$cfg.style.display === 'none' ? 'flex' : 'none';
        try { self.$cle.value = localStorage.getItem('nhm.iaCle') || ''; } catch (e) {}
      };
      if (q('.cfg .ok')) q('.cfg .ok').onclick = function () {
        try { localStorage.setItem('nhm.iaCle', self.$cle.value.trim()); } catch (e) {}
        self.$cfg.style.display = 'none';
        self.bot('Clé enregistrée sur ce poste.');
      };
      r.querySelectorAll('.sugg button').forEach(function (b) {
        b.onclick = function () { self.envoyer(SUGG[+b.dataset.i]); };
      });
      this.$env.onclick = function () { self.envoyer(); };
      this.$ta.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); self.envoyer(); }
      });
    }
    ajout(cls, txt) {
      var d = document.createElement('div');
      d.className = 'msg ' + cls; d.textContent = txt;
      this.$fil.appendChild(d);
      this.$fil.scrollTop = this.$fil.scrollHeight;
      return d;
    }
    bot(t) { this.ajout('b', t); }
    detecterAction(t) {
      var m = t.match(/(?:trouver?|cherche[rz]?|localise[rz]?|o\u00f9\s+(?:est|se\s+trouve))\s+(?:le\s+|la\s+|un\s+|une\s+)?(?:local|salle|pi\u00e8ce|bureau|zone)?\s*[:\u00ab"']?\s*(.{2,40})/i);
      return m ? m[1].replace(/[?.!\u00bb"']+$/, '').trim() : null;
    }
    actionLocal(q) {
      if (!(window.nhmActions && window.nhmActions.chercherLocal)) {
        this.bot('La recherche de locaux se fait depuis l\u2019interface Saisie terrain (champ \u00ab Trouver un local \u00bb en haut de page) ou la Cartographie.');
        return;
      }
      var res = window.nhmActions.chercherLocal(q) || [];
      if (!res.length) { this.bot('Aucun local ne correspond \u00e0 \u00ab ' + q + ' \u00bb. Essayer le code du local (ex. 1.023) ou une partie du nom.'); return; }
      this.bot(res.length + ' r\u00e9sultat(s) pour \u00ab ' + q + ' \u00bb \u2014 cliquer pour ouvrir le local dans la saisie :');
      var d = document.createElement('div');
      d.style.cssText = 'align-self:flex-start;display:flex;flex-direction:column;gap:5px;max-width:92%';
      var self = this;
      res.slice(0, 6).forEach(function (r2) {
        var b = document.createElement('button');
        b.style.cssText = 'border:1.5px solid #E9531D;background:#FFFFFF;color:#111111;border-radius:12px;padding:7px 11px;font-size:12.5px;font-weight:700;cursor:pointer;text-align:left;font-family:inherit';
        b.textContent = r2.b + ' \u00b7 ' + (r2.lvAff || r2.lv) + ' \u00b7 ' + r2.code + ' \u2014 ' + r2.nom + (r2.pct === null || r2.pct === undefined ? '' : ' (' + r2.pct + ' %)');
        b.onclick = function () { window.nhmActions.ouvrirLocal(r2); self.$pan.style.display = 'none'; };
        d.appendChild(b);
      });
      this.$fil.appendChild(d); this.$fil.scrollTop = this.$fil.scrollHeight;
    }
    async envoyer(force) {
      var t = (force || this.$ta.value || '').trim();
      if (!t || this._occup) return;
      this.$ta.value = '';
      this.ajout('u', t);
      this.hist.push({ role: 'user', content: t });
      var act = this.detecterAction(t);
      if (act) { this.actionLocal(act); this.hist = this.hist.slice(-14); return; }
      var tape = document.createElement('div');
      tape.className = 'tape'; tape.innerHTML = '<i></i><i></i><i></i>';
      this.$fil.appendChild(tape); this.$fil.scrollTop = this.$fil.scrollHeight;
      this._occup = true; this.$env.disabled = true;
      var rep = '', err = '';
      try { rep = await this.appeler(t); } catch (e) { err = String(e && e.message ? e.message : e); }
      tape.remove(); this._occup = false; this.$env.disabled = false;
      if (rep) { this.hist.push({ role: 'assistant', content: rep }); this.bot(rep); }
      else this.ajout('e', err.indexOf('CLE') === 0
        ? (DEFAUT_CLE ? 'Clé API invalide dans chatbot-aide.js — la remplacer et republier.' : 'Aucune clé API : cliquer ⚙ et coller une clé Anthropic (sk-ant-…). Sur ce poste seulement.')
        : 'Réponse impossible (' + (err || 'connexion') + '). Vérifier la connexion.');
      this.hist = this.hist.slice(-14);
    }
    async appeler(t) {
      var sys = systeme(this.app);
      if (window.claude && window.claude.complete) {
        var conv = this.hist.map(function (m) { return (m.role === 'user' ? 'Utilisateur : ' : 'Assistant : ') + m.content; }).join('\n');
        return await window.claude.complete(sys + '\n\n' + conv + '\nAssistant :');
      }
      var cle = DEFAUT_CLE;
      try { cle = (DEFAUT_CLE ? '' : localStorage.getItem('nhm.iaCle')) || DEFAUT_CLE; } catch (e) {}
      if (!cle) throw new Error('CLE');
      if (cle.indexOf('sk-ant') !== 0) {
        var conv2 = this.hist.map(function (m) { return { role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.content }] }; });
        var rg = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=' + encodeURIComponent(cle), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ system_instruction: { parts: [{ text: sys }] }, contents: conv2, generationConfig: { maxOutputTokens: 600 } })
        });
        var og = await rg.json();
        if (og && og.error) throw new Error(og.error.message || 'erreur API Gemini');
        var cand = og && og.candidates && og.candidates[0];
        return cand && cand.content && cand.content.parts ? cand.content.parts.map(function (p) { return p.text || ''; }).join('') : '';
      }
      var r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': cle,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({ model: MODELE, max_tokens: 600, system: sys, messages: this.hist })
      });
      var o = await r.json();
      if (o && o.error) throw new Error(o.error.message || 'erreur API');
      return o && o.content && o.content[0] ? o.content[0].text : '';
    }
  }
  customElements.define('nhm-chatbot', NHMChatbot);
})();
