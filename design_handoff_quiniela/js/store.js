// ============================================================
// Quiniela del Bienestar — Estado (localStorage) + lógica de puntos
// ============================================================
window.QDB_STORE = (function () {
  var KEY = 'qdb_state_v1';
  var D = window.QDB_DATA;

  // ---------- usuarios demo ----------
  var DEMO_USERS = [
    { id: 'u_carlos',  nombre: 'Carlos',   apellido: 'Mendoza' },
    { id: 'u_lupita',  nombre: 'Lupita',   apellido: 'Ramírez' },
    { id: 'u_jorge',   nombre: 'Jorge',    apellido: 'Hernández' },
    { id: 'u_anasofia',nombre: 'Ana Sofía',apellido: 'Torres' },
    { id: 'u_profe',   nombre: 'Rubén',    apellido: 'Gutiérrez' },
    { id: 'u_marisol', nombre: 'Marisol',  apellido: 'Castillo' },
    { id: 'u_beto',    nombre: 'Beto',     apellido: 'Aguilar' },
    { id: 'u_daniela', nombre: 'Daniela',  apellido: 'Ríos' }
  ].map(function (u, i) {
    return {
      id: u.id, nombre: u.nombre, apellido: u.apellido,
      email: u.nombre.toLowerCase().replace(/\s/g, '') + '@demo.mx',
      password: 'demo123', photo: null, demo: true, confirmed: true,
      color: ['#e0a83c','#5aa9e6','#e26d5c','#9d79bc','#6cae75','#d96fa8','#c2b25f','#62b6cb'][i]
    };
  });

  // hash determinista para picks demo
  function hash(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 16777619) >>> 0; }
    return h;
  }
  function demoPick(uid, mid) {
    var r = hash(uid + '|' + mid) % 100;
    return r < 45 ? 'H' : (r < 70 ? 'D' : 'A');
  }

  function seedState() {
    var picks = {};
    DEMO_USERS.forEach(function (u) {
      picks[u.id] = {};
      D.MATCHES.forEach(function (m) {
        if (!m.ko) picks[u.id][m.id] = demoPick(u.id, m.id);
      });
    });
    return {
      users: DEMO_USERS.slice(),
      picks: picks,          // { userId: { matchId: 'H'|'D'|'A' } }
      results: {},           // { matchId: { hg, ag, winner? } }  winner solo en KO empatados
      koTeams: {},           // { matchId: { h: 'MEX', a: 'BRA' } }
      session: null,         // userId con sesión activa
      clockOffsetDays: 0     // para demo: adelantar el reloj
    };
  }

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) {
        var st = JSON.parse(raw);
        if (st && st.users) return st;
      }
    } catch (e) {}
    var fresh = seedState();
    save(fresh);
    return fresh;
  }
  function save(st) {
    try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {}
  }

  // ---------- helpers de dominio ----------
  function now(st) {
    var t = Date.now();
    if (st && st.clockOffsetDays) t += st.clockOffsetDays * 86400000;
    return t;
  }
  function isLocked(m, st) { return now(st) >= new Date(m.utc).getTime(); }

  function matchTeams(m, st) {
    if (!m.ko) return { h: m.h, a: m.a };
    var kt = st.koTeams[m.id];
    return { h: kt && kt.h || null, a: kt && kt.a || null };
  }

  function outcome(m, st) {
    var r = st.results[m.id];
    if (!r) return null;
    if (r.hg > r.ag) return 'H';
    if (r.hg < r.ag) return 'A';
    return m.ko ? (r.winner || null) : 'D';
  }

  function computeStandings(st) {
    var played = D.MATCHES.filter(function (m) { return outcome(m, st) !== null; });
    return st.users.map(function (u) {
      var pts = 0, ok = 0, total = 0;
      played.forEach(function (m) {
        var p = st.picks[u.id] && st.picks[u.id][m.id];
        if (!p) return;
        total++;
        if (p === outcome(m, st)) { pts += 1; ok += 1; }
      });
      var pickCount = Object.keys(st.picks[u.id] || {}).length;
      return { user: u, points: pts, aciertos: ok, jugados: played.length, conPick: total, totalPicks: pickCount };
    }).sort(function (a, b) {
      return b.points - a.points ||
             b.aciertos - a.aciertos ||
             (a.user.nombre + a.user.apellido).localeCompare(b.user.nombre + b.user.apellido);
    });
  }

  function fullName(u) { return u.nombre + ' ' + u.apellido; }
  function initials(u) {
    return (u.nombre[0] || '') + (u.apellido[0] || '');
  }

  // ---------- fechas ----------
  var DIAS = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
  var MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  function fmtDate(utc) {
    var d = new Date(utc);
    return DIAS[d.getDay()] + ' ' + d.getDate() + ' de ' + MESES[d.getMonth()];
  }
  function fmtTime(utc) {
    var d = new Date(utc);
    var h = d.getHours(), m = d.getMinutes();
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  }
  function dateKey(utc) {
    var d = new Date(utc);
    return d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate();
  }

  return {
    load: load, save: save, seedState: seedState,
    now: now, isLocked: isLocked, matchTeams: matchTeams, outcome: outcome,
    computeStandings: computeStandings, fullName: fullName, initials: initials,
    fmtDate: fmtDate, fmtTime: fmtTime, dateKey: dateKey,
    DEMO_USERS: DEMO_USERS
  };
})();
