/* Barre de navigation commune NHM · HMIMV — web component autonome.
   <nhm-nav app="saisie"></nhm-nav>   app ∈ saisie | carto | resultats | vue3d
   Affiche : applications (active en surbrillance), opérateur, état de synchronisation (saisies en attente d'envoi,
   dernière donnée validée), état réseau. Lit uniquement localStorage — aucune dépendance aux pages. */
(function () {
  if (customElements.get('nhm-nav')) return;
  var APPS = [
    { k: 'saisie', lab: 'Saisie terrain', href: 'Saisie terrain - NHM.html', c: '#E8A13C' },
    { k: 'carto', lab: 'Cartographie', href: 'index.html', c: '#5B8DEF' },
    { k: 'resultats', lab: 'R\u00e9sultats', href: 'Resultats - NHM.html', c: '#57B26B' },
    { k: 'vue3d', lab: 'Vue 3D', href: 'Vue 3D.html', c: '#E8632B' },
    { k: 'docs', lab: 'Documents', href: 'Documents Kairnial.html', c: '#9B7BD4' }
  ];
  var CSS = ':host{display:block;position:fixed;top:0;left:0;right:0;z-index:2147483000;font-family:"Archivo Narrow",Arial,sans-serif;}' +
    '.b{display:flex;align-items:center;gap:6px;height:38px;padding:0 10px 0 6px;background:#1F2620;color:#F2F1ED;box-shadow:0 2px 10px rgba(0,0,0,.25);}' +
    '.m{display:flex;align-items:center;gap:8px;padding:0 10px 0 6px;height:28px;border-radius:8px;text-decoration:none;color:#F2F1ED;font-weight:800;font-size:13px;letter-spacing:.4px;font-family:Archivo,"Archivo Narrow",Arial,sans-serif;}' +
    '.m:hover{background:rgba(255,255,255,.1);}.m i{display:block;width:22px;height:22px;border-radius:6px;background:#E8632B;color:#fff;font-size:9px;font-weight:800;display:flex;align-items:center;justify-content:center;letter-spacing:0;}' +
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
    '.op{display:flex;flex-direction:column;line-height:1.1;text-align:right;}' +
    '.op small{font-size:9px;font-weight:700;letter-spacing:1px;color:#8C8880;}.op span{font-size:13px;font-weight:700;color:#fff;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}' +
    '.av{width:26px;height:26px;border-radius:50%;background:#E8632B;color:#fff;display:flex;align-items:center;justify-content:center;font-size:11.5px;font-weight:800;}' +
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
  function etat() {
    var nom = '', att = 0, dern = '';
    try { nom = localStorage.getItem('saisieTerrain.nom') || ''; } catch (e) {}
    try { var d = JSON.parse(localStorage.getItem('saisieTerrain.draft.v1') || '{}'); for (var k in d) if (k.slice(0, 4) === 'att|' && d[k]) att++; } catch (e) {}
    try { dern = localStorage.getItem('nhm.dernierPull') || ''; } catch (e) {}
    return { nom: nom, att: att, dern: dern, online: navigator.onLine !== false };
  }

  class NhmNav extends HTMLElement {
    connectedCallback() {
      var r = this.attachShadow({ mode: 'open' });
      var app = this.getAttribute('app') || '';
      r.innerHTML = '<style>' + CSS + '</style><div class="b">' +
        '<a class="m" href="app.html" title="Lanceur"><i>NHM</i><span>HMIMV</span></a>' +
        '<div class="lg"><img src="https://lh3.googleusercontent.com/d/1p4Xu-kw1YRoCoIVvglcxlK49Qo91t7_E=w200" alt="H\u00f4pital Militaire" onerror="this.remove()"><img src="https://lh3.googleusercontent.com/d/1J8QnlcWb8gaMKwtHaLv45TkidZjcE5da=w200" alt="Bymaro" onerror="this.outerHTML=\'<span class=by>BYMARO</span>\'"></div><div class="sep"></div>' +
        '<nav>' + APPS.map(function (a) { return '<a href="' + a.href + '" class="' + (a.k === app ? 'on' : '') + '" style="--c:' + a.c + '" title="' + a.lab + '"><b></b><span>' + a.lab + '</span></a>'; }).join('') + '</nav>' +
        '<div class="sp"></div><a class="st" id="st" href="Saisie terrain - NHM.html" title="Synchronisation"><i></i><span class="l"></span></a>' +
        '<div class="op" id="op"><small>OP\u00c9RATEUR</small><span></span></div><div class="av" id="av"></div></div>';
      this._st = r.getElementById('st'); this._op = r.getElementById('op'); this._av = r.getElementById('av');
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
    disconnectedCallback() { if (this._mo) this._mo.disconnect(); clearInterval(this._t); window.removeEventListener('storage', this._on); window.removeEventListener('online', this._on); window.removeEventListener('offline', this._on); window.removeEventListener('focus', this._on); }
    maj() {
      var e = etat(), st = this._st, l = st.querySelector('.l');
      if (!e.online) { st.className = 'st off'; l.textContent = 'Hors ligne \u00b7 saisies conserv\u00e9es sur ce poste'; st.title = 'Aucune connexion : les saisies sont gard\u00e9es localement'; }
      else if (e.att) { st.className = 'st att'; l.textContent = e.att + ' saisie' + (e.att > 1 ? 's' : '') + ' en attente d\u2019envoi'; st.title = 'Ouvrir Saisie terrain pour envoyer'; }
      else { st.className = 'st ok'; l.textContent = e.dern ? 'Synchronis\u00e9 \u00b7 donn\u00e9es valid\u00e9es ' + relDate(e.dern) : 'Synchronis\u00e9'; st.title = 'Toutes les saisies de ce poste sont envoy\u00e9es'; }
      var has = !!e.nom;
      this._op.style.display = has ? '' : 'none'; this._av.style.display = has ? '' : 'none';
      if (has) { this._op.querySelector('span').textContent = e.nom; this._av.textContent = ini(e.nom); this._av.title = e.nom; }
    }
  }
  customElements.define('nhm-nav', NhmNav);
})();
