// Dane demonstracyjne (deterministyczne) – żeby aplikacja działała przed podłączeniem Garmina.
(function (root) {
  function rng(seed) { return () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296; }

  function make(nowKey) {
    const r = rng(7), T = root.Tri, acts = [], wellness = [];
    let id = 1;
    // 14 tygodni: 3 tygodnie budowania + 1 lżejszy, w każdym pływanie x2, rower x2-3, bieg x3
    for (let day = 98; day >= 0; day--) {
      const d = T.addDays(nowKey, -day), wd = (T.parse(d).getDay() + 6) % 7, wk = Math.floor((98 - day) / 7), lvl = (wk % 4 === 3 ? 0.7 : 1 + (wk % 4) * 0.08) * (0.85 + wk * 0.012);
      const add = (type, name, min, distKm, hr, np) => acts.push({
        id: id++, date: d + ' 07:00:00', type, name, dur: Math.round(min * 60 * lvl * (0.93 + r() * 0.14)),
        dist: Math.round(distKm * 1000 * lvl * (0.93 + r() * 0.14)), hr: Math.round(hr + r() * 6), maxHr: Math.round(hr + 18),
        np: np ? Math.round(np + r() * 12) : 0, elev: type === 'cycling' ? Math.round(150 * lvl * r() * 4) : 0, te: +(2 + r() * 2).toFixed(1),
      });
      if (wd === 0) add('lap_swimming', 'Pływanie – technika', 50, 2.0, 128);
      if (wd === 1) add('running', 'Bieg – interwały', 55, 10.5, 163);
      if (wd === 2) add('cycling', 'Rower – tempo', 75, 33, 148, 205);
      if (wd === 3) add('lap_swimming', 'Pływanie – CSS', 55, 2.4, 140);
      if (wd === 4) add('running', 'Bieg – spokojny', 45, 8, 139);
      if (wd === 5) add('cycling', 'Rower – długi', 170, 78, 140, 190);
      if (wd === 6) add('running', 'Bieg – długi', 85, 15.5, 144);
      wellness.push({
        date: d, rhr: Math.round(49 + r() * 4 + (wd === 0 ? 1 : 0)), hrv: Math.round(62 + r() * 14 - wk * 0.2), sleep: Math.round(72 + r() * 18),
        sleepH: +(6.6 + r() * 1.6).toFixed(1), bb: Math.round(55 + r() * 40), vo2: +(52 + wk * 0.08 + r() * 0.3).toFixed(1),
      });
    }
    return { updated: nowKey + 'T06:00:00', demo: true, activities: acts, wellness };
  }
  root.TriDemo = { make };
})(typeof window !== 'undefined' ? window : globalThis);
