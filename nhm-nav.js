/* Barre de navigation commune NHM · HMIMV — web component autonome.
   <nhm-nav app="saisie"></nhm-nav>   app ∈ saisie | carto | resultats | vue3d
   Affiche : applications (active en surbrillance), opérateur, état de synchronisation (saisies en attente d'envoi,
   dernière donnée validée), état réseau. Lit uniquement localStorage — aucune dépendance aux pages. */
(function () {
  if (customElements.get('nhm-nav')) return;
  var APPS = [
    { k: 'saisie', lab: 'Pointage chantier', href: 'Saisie terrain - NHM.html', c: '#E8A13C' },
    { k: 'carto', lab: 'Suivi CET', href: 'index.html', c: '#5B8DEF' },
    { k: 'resultats', lab: 'R\u00e9sultats', href: 'Resultats - NHM.html', c: '#57B26B' },
    { k: 'appro', lab: 'Approvisionnement', href: 'Suivi approvisionnement.html', c: '#9B7BD4' },
    { k: 'vue3d', lab: 'Vue 3D', href: 'Vue 3D.html', c: '#E8632B' },
    { k: 'docs', lab: 'Documents', href: 'Documents Kairnial.html', c: '#9B7BD4' }
  ];
  var CSS = ':host{display:block;position:fixed;top:0;left:0;right:0;z-index:2147483000;font-family:"Archivo Narrow",Arial,sans-serif;}' +
    '.b{display:flex;align-items:center;gap:6px;height:38px;padding:0 10px 0 6px;background:#1F2620;color:#F2F1ED;box-shadow:0 2px 10px rgba(0,0,0,.25);}' +
    '.m{display:flex;align-items:center;gap:8px;padding:0 10px 0 6px;height:28px;border-radius:8px;text-decoration:none;color:#F2F1ED;font-weight:800;font-size:13px;letter-spacing:.4px;font-family:Archivo,"Archivo Narrow",Arial,sans-serif;}' +
    '.m:hover{background:rgba(255,255,255,.1);}.m i{flex:none;display:flex;align-items:center;justify-content:center;height:22px;padding:0 6px;border-radius:6px;background:#E8632B;color:#fff;font-style:normal;font-size:10.5px;font-weight:800;letter-spacing:.3px;line-height:1;}' +
    '.m span{font-family:"Archivo Narrow",Arial,sans-serif;font-size:12.5px;font-weight:500;letter-spacing:.8px;color:#D9D6CF;}.m:hover span{color:#FFFFFF;}' +
    '.sep{width:1px;height:20px;background:rgba(255,255,255,.18);margin:0 2px;}' +
    '.lg{display:flex;align-items:center;gap:8px;padding:0 6px;}.lg img{display:block;height:22px;width:auto;}.lg .by{height:22px;padding:0 9px;border-radius:11px;background:#E8632B;color:#fff;font-family:Archivo,"Archivo Narrow",Arial,sans-serif;font-size:10.5px;font-weight:800;letter-spacing:.6px;display:flex;align-items:center;}' +
    'nav{display:flex;gap:2px;}' +
    'nav a{position:relative;display:flex;align-items:center;gap:7px;height:28px;padding:0 11px;border-radius:8px;text-decoration:none;color:#C9C6BE;font-size:13.5px;font-weight:700;white-space:nowrap;transition:background .12s,color .12s;}' +
    'nav a:hover{background:rgba(255,255,255,.1);color:#fff;}' +
    'nav a b{display:block;width:7px;height:7px;border-radius:50%;background:var(--c);opacity:.75;}' +
    'nav a.on{color:#fff;background:rgba(255,255,255,.12);}nav a.on b{opacity:1;box-shadow:0 0 0 3px color-mix(in srgb,var(--c) 35%,transparent);}' +
    'nav a.on::after{content:"";position:absolute;left:11px;right:11px;bottom:-5px;height:2px;border-radius:2px;background:var(--c);}' +
    '.sp{flex:1;}' +
    '.st{display:flex;align-items:center;gap:8px;height:26px;padding:0 10px;border-radius:13px;background:rgba(255,255,255,.08);font-size:12.5px;font-weight:700;color:#E3E0DA;white-space:nowrap;text-decoration:none;}' +
    '.st:hover{background:rgba(255,255,255,.14);}.st i{display:block;width:8px;height:8px;border-radius:50%;}' +
    '.st.att i{background:#F2C94C;animation:puls 1.6s ease-in-out infinite;}.st.ok i{background:#57B26B;}.st.off i{background:#C64540;}' +
    '.usr{position:relative;}' +
    '.usr>button{display:flex;align-items:center;gap:8px;height:30px;padding:2px 10px 2px 2px;border-radius:15px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.08);color:#fff;font:inherit;cursor:pointer;}' +
    '.usr>button:hover{background:rgba(255,255,255,.16);}' +
    '.av{width:26px;height:26px;border-radius:50%;background:#E8632B;color:#fff;display:flex;align-items:center;justify-content:center;font-size:11.5px;font-weight:800;overflow:hidden;flex:none;}' +
    '.av img{width:100%;height:100%;object-fit:cover;display:block;}' +
    '.nm{display:flex;flex-direction:column;align-items:flex-start;line-height:1.05;min-width:0;}' +
    '.nm b{font-size:12.5px;font-weight:700;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}' +
    '.nm i{font-style:normal;font-size:9px;font-weight:700;letter-spacing:1px;color:#C9C6BE;}' +
    '.mn{position:absolute;right:0;top:calc(100% + 8px);width:280px;background:#FFFFFF;color:#1F2620;border-radius:14px;box-shadow:0 18px 50px rgba(0,0,0,.35);padding:16px;display:none;flex-direction:column;gap:10px;z-index:9100;font-family:"Archivo Narrow",Arial,sans-serif;text-align:left;}' +
    '.mn.on{display:flex;}' +
    '.mn .top{display:flex;align-items:center;gap:12px;}' +
    '.mn .big{width:56px;height:56px;border-radius:50%;background:#E8632B;color:#fff;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:800;overflow:hidden;flex:none;}' +
    '.mn .big img{width:100%;height:100%;object-fit:cover;}' +
    '.mn .who{min-width:0;display:flex;flex-direction:column;gap:2px;}' +
    '.mn .who b{font-family:Archivo,"Archivo Narrow",Arial,sans-serif;font-size:16px;font-weight:800;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}' +
    '.mn .who span{font-size:12.5px;color:#6B675F;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}' +
    '.mn .who .role{display:inline-block;width:fit-content;font-size:10.5px;font-weight:800;letter-spacing:1px;padding:2px 8px;border-radius:9px;background:#F1EFEA;color:#4A463F;}' +
    '.mn .who .role.adm{background:#FDF3D8;color:#8C6A1F;}' +
    '.mn .ln{display:flex;flex-direction:column;gap:3px;font-size:12.5px;color:#4A463F;border-top:1px solid #EDEAE4;padding-top:10px;}' +
    '.mn .ln b{color:#1F2620;}' +
    '.mn .act{display:flex;gap:8px;border-top:1px solid #EDEAE4;padding-top:10px;}' +
    '.mn .act button,.mn .act label{flex:1;display:flex;align-items:center;justify-content:center;height:34px;border-radius:9px;border:1.5px solid #C9C5BD;background:#fff;color:#1F2620;font:inherit;font-size:13px;font-weight:700;cursor:pointer;}' +
    '.mn .act .out{background:#1F2620;color:#fff;border-color:#1F2620;}' +
    '.mn .act input{display:none;}' +
    '@keyframes puls{0%,100%{opacity:1}50%{opacity:.35}}' +
    '@media(max-width:820px){.lg img:first-child{display:none}nav a span{display:none}nav a{padding:0 9px}.st span.l{display:none}.op{display:none}.m span{display:none}}';

  function ini(n) { return (n || '').trim().split(/\s+/).slice(0, 2).map(function (s) { return s[0] || ''; }).join('').toUpperCase() || '?'; }
  function relDate(iso) {
    if (!iso) return '';
    var d = new Date(iso); if (isNaN(d)) return '';
    var m = Math.round((Date.now() - d.getTime()) / 60000);
    if (m < 1) return '\u00e0 l\u2019instant'; if (m < 60) return 'il y a ' + m + ' min';
    var h = Math.round(m / 60); if (h < 24) return 'il y a ' + h + ' h';
    return 'le ' + d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) + ' \u00e0 ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }
  function sess() { try { return JSON.parse(localStorage.getItem('hmimv.session') || sessionStorage.getItem('hmimv.session') || 'null'); } catch (e) { return null; } }
  function etat() {
    var nom = '', att = 0, dern = '', s = sess();
    try { nom = (s && s.nom) || localStorage.getItem('saisieTerrain.nom') || ''; } catch (e) {}
    try { var d = JSON.parse(localStorage.getItem('saisieTerrain.draft.v1') || '{}'); for (var k in d) if (k.slice(0, 4) === 'att|' && d[k]) att++; } catch (e) {}
    try { dern = localStorage.getItem('nhm.dernierPull') || ''; } catch (e) {}
    return { nom: nom, att: att, dern: dern, online: navigator.onLine !== false, s: s };
  }

  class NhmNav extends HTMLElement {
    connectedCallback() {
      var r = this.attachShadow({ mode: 'open' });
      var app = this.getAttribute('app') || '';
      r.innerHTML = '<style>' + CSS + '</style><div class="b">' +
        '<a class="m" href="app.html#accueil" target="_top" title="Retour \u00e0 l\u2019accueil"><i>NHM</i><span>Accueil</span></a>' +
        '<nav>' + APPS.map(function (a) { return '<a href="' + a.href + '" class="' + (a.k === app ? 'on' : '') + '" style="--c:' + a.c + '" title="' + a.lab + '"><b></b><span>' + a.lab + '</span></a>'; }).join('') + '</nav>' +
        '<div class="sp"></div><a class="st" id="st" href="Saisie terrain - NHM.html" title="Synchronisation"><i></i><span class="l"></span></a>' +
        '<div class="usr" id="usr"><button id="ub" title="Mon compte"><span class="av" id="av"></span><span class="nm"><b id="un"></b><i id="ur"></i></span></button>' +
        '<div class="mn" id="mn"><div class="top"><div class="big" id="big"></div><div class="who"><b id="mnN"></b><span id="mnE"></span><span class="role" id="mnR"></span></div></div>' +
        '<div class="ln" id="mnL"></div>' +
        '<a id="gc" href="app.html#comptes" target="_top" style="display:none;align-items:center;justify-content:center;height:34px;border-radius:9px;background:#F1EFEA;color:#1F2620;text-decoration:none;font-size:13px;font-weight:700;">G\u00e9rer les comptes</a>' +
        '<div class="act"><label title="Choisir une photo (JPG, PNG)">Changer la photo<input type="file" id="ph" accept="image/*"></label><button class="out" id="out">Se d\u00e9connecter</button></div></div></div></div>';
      this._st = r.getElementById('st'); this._usr = r.getElementById('usr'); this._av = r.getElementById('av');
      r.getElementById('ub').onclick = function (e) { e.stopPropagation(); r.getElementById('mn').classList.toggle('on'); };
      this._doc = function () { r.getElementById('mn').classList.remove('on'); }; document.addEventListener('click', this._doc);
      r.getElementById('mn').onclick = function (e) { e.stopPropagation(); };
      r.getElementById('out').onclick = function () { try { localStorage.removeItem('hmimv.session'); sessionStorage.removeItem('hmimv.session'); localStorage.removeItem('hmimv.role'); } catch (e) {} location.href = 'app.html'; };
      var self = this;
      r.getElementById('ph').onchange = function () {
        var f = this.files && this.files[0]; if (!f) return;
        var img = new Image(); img.onload = function () {
          var c = document.createElement('canvas'), S = 128, m = Math.min(img.width, img.height); c.width = S; c.height = S;
          c.getContext('2d').drawImage(img, (img.width - m) / 2, (img.height - m) / 2, m, m, 0, 0, S, S);
          var d = c.toDataURL('image/jpeg', 0.82), s = sess();
          if (s) { s.photo = d; try { (localStorage.getItem('hmimv.session') ? localStorage : sessionStorage).setItem('hmimv.session', JSON.stringify(s)); } catch (e) {}
            var api = ''; try { api = localStorage.getItem('hmimv.api.comptes') || ''; } catch (e) {}
            if (api && s.h) fetch(api, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ a: 'photo', email: s.email, mdp: s.h, photo: d }) }).catch(function () {}); }
          self.maj();
        }; img.src = URL.createObjectURL(f);
      };
      this._t = setInterval(this.maj.bind(this), 5000);
      this._on = this.maj.bind(this);
      window.addEventListener('storage', this._on); window.addEventListener('online', this._on); window.addEventListener('offline', this._on); window.addEventListener('focus', this._on);
      this.maj();
      /* La barre est fixée au-dessus de tout (y compris les écrans de connexion) : on décale la page de sa hauteur. */
      var st = document.getElementById('nhm-nav-pad'); if (!st) { st = document.createElement('style'); st.id = 'nhm-nav-pad'; document.head.appendChild(st); }
      st.textContent = 'html{scroll-padding-top:38px}body{padding-top:38px !important;box-sizing:border-box}[data-nhm-fixed]{top:38px !important}';
      this._fix = function () { document.querySelectorAll('div').forEach(function (d) { if (d.hasAttribute('data-nhm-fixed') || d.shadowRoot) return; var cs = getComputedStyle(d); if (cs.position === 'fixed' && cs.top === '0px' && d.getBoundingClientRect().height > innerHeight * 0.6) d.setAttribute('data-nhm-fixed', '1'); }); };
      this._fix(); this._mo = new MutationObserver(this._fix); this._mo.observe(document.body, { childList: true, subtree: true });
    }
    disconnectedCallback() { if (this._mo) this._mo.disconnect(); document.removeEventListener('click', this._doc); clearInterval(this._t); window.removeEventListener('storage', this._on); window.removeEventListener('online', this._on); window.removeEventListener('offline', this._on); window.removeEventListener('focus', this._on); }
    maj() {
      var e = etat(), st = this._st, l = st.querySelector('.l');
      if (!e.online) { st.className = 'st off'; l.textContent = 'Hors ligne \u00b7 saisies conserv\u00e9es sur ce poste'; st.title = 'Aucune connexion : les saisies sont gard\u00e9es localement'; }
      else if (e.att) { st.className = 'st att'; l.textContent = e.att + ' saisie' + (e.att > 1 ? 's' : '') + ' en attente d\u2019envoi'; st.title = 'Ouvrir Saisie terrain pour envoyer'; }
      else { st.className = 'st ok'; l.textContent = e.dern ? 'Synchronis\u00e9 \u00b7 donn\u00e9es valid\u00e9es ' + relDate(e.dern) : 'Synchronis\u00e9'; st.title = 'Toutes les saisies de ce poste sont envoy\u00e9es'; }
      var has = !!e.nom, r = this.shadowRoot, s = e.s || {};
      this._usr.style.display = has ? '' : 'none';
      if (!has) return;
      var avatar = function (el) { el.innerHTML = ''; if (s.photo) { var im = document.createElement('img'); im.src = s.photo; el.appendChild(im); } else el.textContent = ini(e.nom); };
      avatar(this._av); avatar(r.getElementById('big'));
      r.getElementById('un').textContent = e.nom; r.getElementById('ur').textContent = s.role === 'admin' ? 'ADMIN' : (s.email ? 'UTILISATEUR' : 'OP\u00c9RATEUR');
      r.getElementById('mnN').textContent = e.nom; r.getElementById('mnE').textContent = s.email || 'compte local (sans e-mail)';
      r.getElementById('gc').style.display = 'none';
      var rl = r.getElementById('mnR'); rl.textContent = s.role === 'admin' ? 'ADMINISTRATEUR' : 'UTILISATEUR'; rl.className = 'role' + (s.role === 'admin' ? ' adm' : '');
      var memo = false; try { memo = !!localStorage.getItem('hmimv.session'); } catch (x) {}
      r.getElementById('mnL').innerHTML = '<span>Droits : <b>' + (s.role === 'admin' ? 'modification du Suivi CET, validation des pointages' : 'pointage chantier, consultation du Suivi CET') + '</b></span><span>Synchronisation : <b>' + l.textContent + '</b></span><span>Session : <b>' + (memo ? 'm\u00e9moris\u00e9e sur ce poste' : 'jusqu\u2019\u00e0 fermeture du navigateur') + '</b></span>';
    }
  }
  customElements.define('nhm-nav', NhmNav);
})();
