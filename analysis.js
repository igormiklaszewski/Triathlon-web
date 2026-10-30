// Analizy treningowe triathlonu – czyste funkcje, działają w przeglądarce (window.Tri) i w Node (require).
(function (root) {
  const DAY = 864e5;

  const DEFAULTS = {
    lthr: 165,      // tętno progowe [bpm]
    rhr: 50,        // tętno spoczynkowe [bpm]
    ftp: 0,         // próg mocy na rowerze [W]; 0 = brak, liczymy z tętna
    runThr: 0,      // tempo progowe biegu [s/km]; 0 = brak
    css: 0,         // critical swim speed [s/100m]; 0 = brak
    weeklyTss: 0,   // docelowy tygodniowy TSS do prognozy formy; 0 = średnia z ostatnich 4 tygodni
    raceDate: '',   // YYYY-MM-DD
  };

  const pad = n => String(n).padStart(2, '0');
  const dkey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (k, n) => dkey(new Date(parse(k).getTime() + n * DAY + 3.6e6)); // +1h: odporność na zmianę czasu
  const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / DAY);

  function sportOf(typeKey) {
    const t = (typeKey || '').toLowerCase();
    if (/swim/.test(t)) return 'swim';
    if (/cycl|bik|ride/.test(t)) return 'bike';
    if (/run|trail/.test(t)) return 'run';
    return 'other';
  }

  // Normalizuje surową aktywność z garmin.json do postaci używanej w analizach.
  function normalize(a) {
    return {
      id: a.id, date: String(a.date).slice(0, 10), name: a.name || '',
      sport: sportOf(a.type), type: a.type,
      dur: a.dur || 0, dist: a.dist || 0, hr: a.hr || 0, maxHr: a.maxHr || 0,
      np: a.np || a.pwr || 0, elev: a.elev || 0, te: a.te || 0, load: a.load || 0,
    };
  }

  // Szacowany TSS aktywności: moc (rower), tempo (bieg), CSS (pływanie), w razie braku progów – tętno.
  function tss(a, s) {
    s = Object.assign({}, DEFAULTS, s);
    const h = a.dur / 3600;
    if (!h) return 0;
    let v = null;
    if (a.sport === 'bike' && a.np && s.ftp) {
      const IF = a.np / s.ftp; v = h * IF * IF * 100;
    } else if (a.sport === 'run' && a.dist > 500 && s.runThr) {
      const IF = Math.min(1.3, s.runThr / (a.dur / (a.dist / 1000))); v = h * IF * IF * 100;
    } else if (a.sport === 'swim' && a.dist > 100 && s.css) {
      const IF = Math.min(1.3, s.css / (a.dur / (a.dist / 100))); v = h * IF ** 3 * 100;
    }
    if (v == null && a.hr && s.lthr > s.rhr) {
      const IF = Math.max(0, (a.hr - s.rhr) / (s.lthr - s.rhr)); v = h * IF * IF * 100;
    }
    if (v == null) v = h * 35;
    return Math.min(v, 500);
  }

  // Performance Management Chart: CTL (42 dni), ATL (7 dni), TSB = CTL - ATL (forma „wczoraj”).
  function pmc(acts, s, toKey) {
    if (!acts.length) return [];
    const byDay = {};
    acts.forEach(a => { byDay[a.date] = (byDay[a.date] || 0) + tss(a, s); });
    const from = Object.keys(byDay).sort()[0];
    const to = toKey || dkey(new Date());
    const kc = 1 - Math.exp(-1 / 42), ka = 1 - Math.exp(-1 / 7);
    let ctl = 0, atl = 0, out = [];
    for (let d = from; d <= to; d = addDays(d, 1)) {
      const t = byDay[d] || 0, tsbBefore = ctl - atl;
      ctl += (t - ctl) * kc; atl += (t - atl) * ka;
      out.push({ d, tss: t, ctl, atl, tsb: tsbBefore });
    }
    return out;
  }

  const weekStart = k => { const d = parse(k); return addDays(k, -((d.getDay() + 6) % 7)); };

  // Agregacja tygodniowa (poniedziałek–niedziela): godziny, dystans i TSS na dyscyplinę.
  function weekly(acts, s) {
    const w = {};
    acts.forEach(a => {
      const k = weekStart(a.date);
      const o = w[k] || (w[k] = { week: k, tss: 0, hours: 0, swim: 0, bike: 0, run: 0, other: 0, dist: { swim: 0, bike: 0, run: 0 } });
      const t = tss(a, s);
      o.tss += t; o.hours += a.dur / 3600; o[a.sport] += a.dur / 3600;
      if (o.dist[a.sport] != null) o.dist[a.sport] += a.dist;
    });
    return Object.values(w).sort((x, y) => x.week.localeCompare(y.week));
  }

  // Ramp rate = zmiana CTL w ciągu ostatnich 7 dni. >8/tydz. zwykle oznacza zbyt szybki wzrost obciążeń.
  function rampRate(series) {
    if (series.length < 8) return 0;
    return series[series.length - 1].ctl - series[series.length - 8].ctl;
  }

  function formState(tsb) {
    if (tsb > 25) return { label: 'Detrening', hint: 'Forma spada z braku bodźca.' };
    if (tsb > 5) return { label: 'Świeżość', hint: 'Dobry moment na start lub mocny trening.' };
    if (tsb > -10) return { label: 'Neutralnie', hint: 'Zbalansowane obciążenie.' };
    if (tsb > -30) return { label: 'Produktywne zmęczenie', hint: 'Budowanie formy, pilnuj regeneracji.' };
    return { label: 'Ryzyko przetrenowania', hint: 'Rozważ odpoczynek lub lżejszy tydzień.' };
  }

  // Prognoza CTL/ATL/TSB, gdy od jutra trenujesz równo weeklyTss na tydzień.
  function forecast(last, weeklyTss, days) {
    const kc = 1 - Math.exp(-1 / 42), ka = 1 - Math.exp(-1 / 7), t = weeklyTss / 7;
    let ctl = last.ctl, atl = last.atl, out = [];
    for (let i = 1; i <= days; i++) {
      const tsbBefore = ctl - atl;
      ctl += (t - ctl) * kc; atl += (t - atl) * ka;
      out.push({ i, ctl, atl, tsb: tsbBefore });
    }
    return out;
  }

  const riegel = (t1, d1, d2) => t1 * Math.pow(d2 / d1, 1.06);

  // Najlepszy niedawny wysiłek biegowy sprowadzony wzorem Riegela do 10 km.
  function bestRun(acts, nowKey, days) {
    const from = addDays(nowKey, -days);
    let best = null;
    acts.filter(a => a.sport === 'run' && a.date >= from && a.dist >= 3000 && a.dur >= 900).forEach(a => {
      const t10 = riegel(a.dur, a.dist, 10000);
      if (!best || t10 < best.t10) best = { t10, from: a };
    });
    return best;
  }

  // Szacunki czasów: biegi z Riegela, 70.3 z CSS/tempa pływackiego, średniej prędkości rowerowej i biegu po rowerze.
  function estimates(acts, s, nowKey) {
    s = Object.assign({}, DEFAULTS, s);
    const out = { run: null, tri: null };
    const br = bestRun(acts, nowKey, 120);
    if (br) {
      out.run = { base: br.from, t5: riegel(br.t10, 10000, 5000), t10: br.t10, thm: riegel(br.t10, 10000, 21097), tm: riegel(br.t10, 10000, 42195) };
    }
    const from = addDays(nowKey, -120);
    let swimPace = s.css ? s.css * 1.04 : null;           // s/100 m
    if (!swimPace) {
      const sw = acts.filter(a => a.sport === 'swim' && a.date >= from && a.dist >= 400 && a.dur > 0)
        .map(a => a.dur / (a.dist / 100)).sort((x, y) => x - y);
      if (sw.length) swimPace = sw[Math.floor(sw.length * 0.25)] * 1.04;
    }
    const rides = acts.filter(a => a.sport === 'bike' && a.date >= from && a.dist >= 40000 && a.dur > 0)
      .map(a => a.dist / a.dur).sort((x, y) => y - x);       // m/s, malejąco
    const bikeSpeed = rides.length ? rides[Math.floor(rides.length * 0.25)] * 0.97 : null;
    if (out.run && swimPace && bikeSpeed) {
      const swim = swimPace * 19, bike = 90000 / bikeSpeed, run = out.run.thm * 1.08, trans = 300;
      out.tri = { swim, bike, run, trans, total: swim + bike + run + trans, bikeKmh: bikeSpeed * 3.6, swimPace };
    }
    return out;
  }

  // Dekuplowanie/trend: średnia z N ostatnich wartości vs. N poprzednich (do kafelków trendu).
  function trend(vals, n) {
    const v = vals.filter(x => x != null && !isNaN(x));
    if (v.length < n * 2) return null;
    const avg = a => a.reduce((p, c) => p + c, 0) / a.length;
    return { now: avg(v.slice(-n)), prev: avg(v.slice(-2 * n, -n)) };
  }

  // Zgodność z planem tygodniowym nie jest tu liczona (plan z TrainingPeaks pominięty w wersji 1).

  const fmtTime = sec => {
    sec = Math.round(sec); const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
    return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
  };
  const fmtPace = sec => `${Math.floor(sec / 60)}:${pad(Math.round(sec % 60) % 60)}`;

  const api = { DEFAULTS, dkey, parse, addDays, daysBetween, sportOf, normalize, tss, pmc, weekStart, weekly, rampRate, formState, forecast, riegel, bestRun, estimates, trend, fmtTime, fmtPace };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Tri = api;
})(typeof window !== 'undefined' ? window : globalThis);
