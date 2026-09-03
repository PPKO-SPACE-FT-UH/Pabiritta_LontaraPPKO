/**
 * Pa'Biritta — Peta interaktif Leaflet.
 * Strategi layer via pane bawaan supaya poligon selalu di bawah titik & popup.
 */

// Fallback strings (Indonesian) — dipakai kalau <script id="pab-map-i18n"> tidak ada
const MAP_I18N_FALLBACK = {
  urlPrefix: '',
  longsorPoint: 'Titik Longsor',
  assemblyPoint: 'Titik Kumpul',
  evacuationRoutePoint: 'Titik Jalur Evakuasi',
  educationFacility: 'Sarana Pendidikan',
  worshipFacility: 'Sarana Peribadatan',
  healthFacility: 'Sarana Kesehatan',
  villageAsset: 'Potensi Desa',
  year: 'Tahun',
  sourcePrimary: 'Sumber: Data Primer',
  status: 'Status',
  moisture: 'Kelembapan',
  sideTilt: 'Kemiringan Samping',
  frontBackTilt: 'Kemiringan Depan-Belakang',
  viewDetails: 'Lihat Detail →',
  offline: 'OFFLINE',
  lastDataAgo: 'Data terakhir {n} menit lalu',
  noDataYet: 'Belum ada data',
  sensorStatus: { Normal: 'Normal', Waspada: 'Waspada', Bahaya: 'Bahaya' },
  laporanStatus: { Menunggu: 'Menunggu', Proses: 'Proses', 'Tindak Lanjut': 'Tindak Lanjut', Selesai: 'Selesai', Ditolak: 'Ditolak' },
  laporanKategori: { 'Potensi Longsor': 'Potensi Longsor', 'Kejadian Longsor': 'Kejadian Longsor', 'Dampak Longsor': 'Dampak Longsor' },
};

function loadMapI18N() {
  const el = document.getElementById('pab-map-i18n');
  if (!el) return MAP_I18N_FALLBACK;
  try {
    return { ...MAP_I18N_FALLBACK, ...JSON.parse(el.textContent) };
  } catch (e) {
    return MAP_I18N_FALLBACK;
  }
}

const MAPI18N = loadMapI18N();

function tKategori(k) { return MAPI18N.laporanKategori[k] || k; }
function tLapStatus(s) { return MAPI18N.laporanStatus[s] || s; }
function tSensorStatus(s) { return MAPI18N.sensorStatus[s] || s; }
function fmtI18n(tpl, vars) { return tpl.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? vars[k] : `{${k}}`)); }

function initPeta(elementId, opts = {}) {
  const LONJOBOKO_BOUNDS = L.latLngBounds(
    [-5.300, 119.680],
    [-5.220, 119.790],
  );

  const map = L.map(elementId, {
    minZoom: 13,
    maxZoom: 18,
    maxBounds: LONJOBOKO_BOUNDS,
    maxBoundsViscosity: 1.0,
  }).setView(opts.center || [-5.263, 119.735], opts.zoom || 14);

  map.getPane('shadowPane').style.zIndex = '250';
  map.getPane('overlayPane').style.zIndex = '400';
  map.getPane('markerPane').style.zIndex = '600';
  map.getPane('popupPane').style.zIndex = '700';
  map.getPane('shadowPane').style.pointerEvents = 'none';

  const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap',
    minZoom: 13,
    maxZoom: 19,
  });

  const satelliteLayer = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    {
      attribution: 'Tiles © Esri',
      minZoom: 13,
      maxZoom: 19,
    }
  );

  osmLayer.addTo(map);

  L.control.layers(
    { 'Default': osmLayer, 'Satelit': satelliteLayer },
    null,
    { position: 'topright', collapsed: true }
  ).addTo(map);

  return map;
}

const LAYERS = {};
const EXCLUSIVE_PAIRS = { zona: 'gunalahan', gunalahan: 'zona' };

const POINT_STYLE = {
  sensor: { fill: '#16A34A', border: '#15803D' },
  laporan: { fill: '#2563EB', border: '#1E40AF' },
  historis: { fill: '#B45309', border: '#78350F' },
  kumpul: { fill: '#059669', border: '#065F46' },
  evakuasi: { fill: '#84CC16', border: '#4D7C0F' },
  pendidikan: { fill: '#7C3AED', border: '#5B21B6' },
  peribadatan: { fill: '#0891B2', border: '#155E75' },
  potensi: { fill: '#DB2777', border: '#9D174D' },
};

const PALETTE_DEFAULT = {
  'Permukiman': { fillColor: '#EF4444', fillOpacity: 0.45 },
  'Persawahan': { fillColor: '#22C55E', fillOpacity: 0.45 },
  'Area Terbuka': { fillColor: '#FDE68A', fillOpacity: 0.55 },
  'Pertambangan': { fillColor: '#78716C', fillOpacity: 0.55 },
  'Hutan': { fillColor: '#166534', fillOpacity: 0.55 },
  'Daerah Aliran Sungai': { fillColor: '#3B82F6', fillOpacity: 0.55 },
};

const PALETTE_SATELIT = {
  'Permukiman': { fillColor: '#EB9B3C', fillOpacity: 0.45 },
  'Persawahan': { fillColor: '#A3FF73', fillOpacity: 0.45 },
  'Area Terbuka': { fillColor: '#006969', fillOpacity: 0.45 },
  'Pertambangan': { fillColor: '#5F7391', fillOpacity: 0.45 },
  'Hutan': { fillColor: '#C7E0B0', fillOpacity: 0.45 },
  'Daerah Aliran Sungai': { fillColor: '#CCFFFF', fillOpacity: 0.45 },
};

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function applyGunaPalette(palette) {
  if (LAYERS.gunalahan && LAYERS.gunalahan.setStyle) {
    LAYERS.gunalahan.setStyle(f => {
      const s = palette[f.properties.Fungsi] || { fillColor: '#9CA3AF', fillOpacity: 0.35 };
      return { ...s, weight: 0, stroke: false };
    });
  }
  document.querySelectorAll('[data-guna]').forEach(el => {
    const s = palette[el.dataset.guna] || { fillColor: '#9CA3AF', fillOpacity: 0.35 };
    el.style.backgroundColor = hexToRgba(s.fillColor, s.fillOpacity);
  });
}

async function safeJson(url, timeoutMs = 15000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

function hideMapLoading(mapId) {
  const overlay = document.getElementById(`${mapId}-loading`);
  if (overlay) {
    overlay.classList.add('opacity-0');
    setTimeout(() => overlay.classList.add('hidden'), 250);
  }
}

async function fetchAndRenderLayers(map) {
  const mapId = map.getContainer().id;
  const polygonRenderer = L.svg({ pane: 'shadowPane' });
  const pointRenderer = L.svg({ pane: 'markerPane' });

  const failsafe = setTimeout(() => hideMapLoading(mapId), 30000);

  const [
    zonaRes, lahanRes, historisRes, kumpulRes, evakuasiRes,
    pendidikanRes, peribadatanRes, kesehatanRes, potensiRes,
    sensorRes, laporanRes,
  ] = await Promise.allSettled([
    safeJson('/static/data/kelas_rawan_longsor.geojson'),
    safeJson('/static/data/guna_lahan.geojson'),
    safeJson('/static/data/historis_longsor.geojson'),
    safeJson('/static/data/titik_kumpul.geojson'),
    safeJson('/static/data/jalur_evakuasi.geojson'),
    safeJson('/static/data/pendidikan.geojson'),
    safeJson('/static/data/peribadatan.geojson'),
    safeJson('/static/data/kesehatan.geojson'),
    safeJson('/static/data/potensi_desa.geojson'),
    safeJson('/api/sensor/list'),
    safeJson('/api/sensor/laporan-titik'),
  ]);

  if (zonaRes.status === 'fulfilled') {
    const styleKelas = (k) => k === 'Tinggi' ? { fillColor: '#DC2626', fillOpacity: 0.55 }
      : k === 'Sedang' ? { fillColor: '#F97316', fillOpacity: 0.45 }
        : { fillColor: '#EAB308', fillOpacity: 0.35 };
    LAYERS.zona = L.geoJSON(zonaRes.value, {
      renderer: polygonRenderer, pane: 'shadowPane', interactive: false,
      style: (f) => ({ ...styleKelas(f.properties.Kelas), weight: 0, stroke: false }),
    });
  } else { LAYERS.zona = L.layerGroup(); }

  if (lahanRes.status === 'fulfilled') {
    LAYERS.gunalahan = L.geoJSON(lahanRes.value, {
      renderer: polygonRenderer, pane: 'shadowPane', interactive: false,
      style: (f) => {
        const s = PALETTE_DEFAULT[f.properties.Fungsi] || { fillColor: '#9CA3AF', fillOpacity: 0.35 };
        return { ...s, weight: 0, stroke: false };
      },
    });
    map.on('baselayerchange', e => {
      applyGunaPalette(e.name === 'Satelit' ? PALETTE_SATELIT : PALETTE_DEFAULT);
    });
  } else { LAYERS.gunalahan = L.layerGroup(); }

  const iconFor = (name) => L.icon({
    iconUrl: `/static/img/icons/${name}.svg`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -14],
  });

  const circleIconFor = (name) => L.divIcon({
    html: `<div style="width:26px;height:26px;background:#9CA3AF;border:2px solid #6B7280;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 4px rgba(0,0,0,0.25);"><img src="/static/img/icons/${name}.svg" style="width:16px;height:16px;"></div>`,
    className: '',
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -14],
  });

  const POTENSI_ICON = { bumdes: 'bumdes', kopdes: 'kopdes', lapangan: 'lapangan_desa', pasar: 'pasar', pabrik: 'pabrik', tambang: 'tambang' };
  const SOURCE_LINE = `<span style="font-size:11px;color:#6b7280;">${MAPI18N.sourcePrimary}</span>`;

  LAYERS.historis = historisRes.status === 'fulfilled'
    ? L.geoJSON(historisRes.value, {
      pointToLayer: (feat, latlng) => L.marker(latlng, { icon: iconFor('titik_longsor'), pane: 'markerPane' }),
      onEachFeature: (feat, layer) => {
        const p = feat.properties || {};
        const tahun = p.Tahun && p.Tahun > 0 ? p.Tahun : '-';
        const nama = p.Keterangan || MAPI18N.longsorPoint;
        layer.bindPopup(`<div style="min-width:180px;"><strong lang="id">${nama}</strong><br>${MAPI18N.year}: <b>${tahun}</b><br>${SOURCE_LINE}</div>`, { autoPan: false });
      },
    })
    : L.layerGroup();

  LAYERS.kumpul = kumpulRes.status === 'fulfilled'
    ? L.geoJSON(kumpulRes.value, {
      pointToLayer: (feat, latlng) => L.marker(latlng, { icon: iconFor('titik_kumpul'), pane: 'markerPane' }),
      onEachFeature: (feat, layer) => {
        const p = feat.properties || {};
        const dusun = (p.Dusun || '').trim();
        const nama = p.Keterangan || MAPI18N.assemblyPoint;
        layer.bindPopup(`<div style="min-width:180px;"><strong lang="id">${nama}</strong><br>${dusun ? `<span lang="id">${dusun}</span><br>` : ''}${SOURCE_LINE}</div>`, { autoPan: false });
      },
    })
    : L.layerGroup();

  const evakuasiIcon = L.divIcon({
    html: `<div style="width:26px;height:26px;background:#84CC16;border:2px solid #4D7C0F;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 4px rgba(0,0,0,0.25);"><svg style="width:14px;height:14px;" fill="white" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.707l-3-3a1 1 0 00-1.414 1.414L10.586 9H7a1 1 0 100 2h3.586l-1.293 1.293a1 1 0 101.414 1.414l3-3a1 1 0 000-1.414z" clip-rule="evenodd"/></svg></div>`,
    className: '',
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -14],
  });
  LAYERS.evakuasi = evakuasiRes.status === 'fulfilled'
    ? L.geoJSON(evakuasiRes.value, {
      pointToLayer: (feat, latlng) => L.marker(latlng, { icon: evakuasiIcon, pane: 'markerPane' }),
      onEachFeature: (feat, layer) => {
        const p = feat.properties || {};
        const dusun = (p.Dusun || '').trim();
        layer.bindPopup(`<div style="min-width:180px;"><strong>${MAPI18N.evacuationRoutePoint}</strong><br>${dusun ? `<span lang="id">${dusun}</span><br>` : ''}${SOURCE_LINE}</div>`, { autoPan: false });
      },
    })
    : L.layerGroup();

  LAYERS.pendidikan = pendidikanRes.status === 'fulfilled'
    ? L.geoJSON(pendidikanRes.value, {
      pointToLayer: (feat, latlng) => L.marker(latlng, { icon: iconFor('pendidikan'), pane: 'markerPane' }),
      onEachFeature: (feat, layer) => {
        const p = feat.properties || {};
        const nama = (p.Keterangan || '').trim();
        const dusun = (p.Dusun || '').trim();
        const judul = nama || MAPI18N.educationFacility;
        layer.bindPopup(`<div style="min-width:180px;"><strong lang="id">${judul}</strong><br>${dusun ? `<span lang="id">${dusun}</span><br>` : ''}${SOURCE_LINE}</div>`, { autoPan: false });
      },
    })
    : L.layerGroup();

  LAYERS.peribadatan = peribadatanRes.status === 'fulfilled'
    ? L.geoJSON(peribadatanRes.value, {
      pointToLayer: (feat, latlng) => L.marker(latlng, { icon: iconFor('peribadatan'), pane: 'markerPane' }),
      onEachFeature: (feat, layer) => {
        const p = feat.properties || {};
        const nama = (p.Keterangan || '').trim();
        const dusun = (p.Dusun || '').trim();
        const judul = nama || MAPI18N.worshipFacility;
        layer.bindPopup(`<div style="min-width:180px;"><strong lang="id">${judul}</strong><br>${dusun ? `<span lang="id">${dusun}</span><br>` : ''}${SOURCE_LINE}</div>`, { autoPan: false });
      },
    })
    : L.layerGroup();

  LAYERS.kesehatan = kesehatanRes.status === 'fulfilled'
    ? L.geoJSON(kesehatanRes.value, {
      pointToLayer: (feat, latlng) => L.marker(latlng, { icon: iconFor('kesehatan'), pane: 'markerPane' }),
      onEachFeature: (feat, layer) => {
        const p = feat.properties || {};
        const nama = (p.Keterangan || '').trim();
        const dusun = (p.Dusun || '').trim();
        const judul = nama || MAPI18N.healthFacility;
        layer.bindPopup(`<div style="min-width:180px;"><strong lang="id">${judul}</strong><br>${dusun ? `<span lang="id">${dusun}</span><br>` : ''}${SOURCE_LINE}</div>`, { autoPan: false });
      },
    })
    : L.layerGroup();

  LAYERS.potensi = potensiRes.status === 'fulfilled'
    ? L.geoJSON(potensiRes.value, {
      pointToLayer: (feat, latlng) => {
        const k = (feat.properties?.Keterangan || '').toLowerCase();
        const match = Object.keys(POTENSI_ICON).find(key => k.includes(key));
        return L.marker(latlng, { icon: iconFor(match ? POTENSI_ICON[match] : 'bumdes'), pane: 'markerPane' });
      },
      onEachFeature: (feat, layer) => {
        const p = feat.properties || {};
        const kategori = (p.Keterangan || '').trim();
        const nama = (p.Nama || '').trim();
        const dusun = (p.Dusun || '').trim();
        const judul = nama || kategori || MAPI18N.villageAsset;
        layer.bindPopup(`<div style="min-width:180px;"><strong lang="id">${judul}</strong><br>${nama && kategori ? `<span lang="id">${kategori}</span><br>` : ''}${dusun ? `<span lang="id">${dusun}</span><br>` : ''}${SOURCE_LINE}</div>`, { autoPan: false });
      },
    })
    : L.layerGroup();

  if (sensorRes.status === 'fulfilled') {
    LAYERS.sensor = L.layerGroup(
      sensorRes.value.map(s => {
        const stale = !!s.is_stale;
        const fill = stale ? '#9CA3AF'
          : s.status === 'Bahaya' ? '#B91C1C'
            : s.status === 'Waspada' ? '#EAB308'
              : POINT_STYLE.sensor.fill;
        const stroke = stale ? '#4B5563'
          : s.status === 'Bahaya' ? '#7F1D1D'
            : s.status === 'Waspada' ? '#854D0E'
              : POINT_STYLE.sensor.border;
        let statusLine;
        if (stale && s.last_seen) {
          const mins = Math.round((Date.now() - new Date(s.last_seen)) / 60000);
          const agoText = fmtI18n(MAPI18N.lastDataAgo, { n: mins });
          statusLine = `${MAPI18N.status}: <b style="color:#4B5563;">${MAPI18N.offline}</b><br><span style="color:#EA580C;">${agoText}</span>`;
        } else if (stale) {
          statusLine = `${MAPI18N.status}: <b style="color:#4B5563;">${MAPI18N.offline}</b><br><span style="color:#9CA3AF;">${MAPI18N.noDataYet}</span>`;
        } else {
          statusLine = `${MAPI18N.status}: <b>${tSensorStatus(s.status)}</b>`;
        }
        const lokasi = s.nama_lokasi || '';
        return L.circleMarker([s.latitude, s.longitude], {
          renderer: pointRenderer, pane: 'markerPane',
          radius: 9, color: stroke, fillColor: fill, fillOpacity: 0.85, weight: 2,
        }).bindPopup(`<strong>${s.kode} — <span lang="id">${lokasi}</span></strong><br>${statusLine}<br>${MAPI18N.moisture}: ${s.kelembapan != null ? s.kelembapan.toFixed(1) + '%' : '-'}<br>${MAPI18N.sideTilt}: ${s.roll != null ? s.roll.toFixed(1) + '°' : '-'}<br>${MAPI18N.frontBackTilt}: ${s.pitch != null ? s.pitch.toFixed(1) + '°' : '-'}`, { autoPan: false });
      })
    );
  } else { LAYERS.sensor = L.layerGroup(); }

  if (laporanRes.status === 'fulfilled') {
    const valid = laporanRes.value.filter(l => l.latitude != null && l.longitude != null);
    const laporanIcon = L.divIcon({
      html: `<div style="width:26px;height:26px;background:#2563EB;border:2px solid #1E40AF;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 4px rgba(0,0,0,0.25);"><svg style="width:14px;height:14px;" fill="white" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clip-rule="evenodd"/></svg></div>`,
      className: '',
      iconSize: [26, 26],
      iconAnchor: [13, 13],
      popupAnchor: [0, -14],
    });
    LAYERS.laporan = L.layerGroup(valid.map(l => {
      const foto = l.foto_url
        ? `<img src="${l.foto_url}" loading="lazy" alt="" style="width:100%;height:120px;object-fit:cover;border-radius:6px;margin-bottom:8px;display:block;">`
        : '';
      const lokasi = l.lokasi_label || '';
      const kategoriLabel = tKategori(l.kategori);
      const statusLabel = tLapStatus(l.status);
      return L.marker([l.latitude, l.longitude], { icon: laporanIcon, pane: 'markerPane' })
        .bindPopup(`<div style="min-width:200px;">${foto}<strong lang="id">${lokasi}</strong><br>${kategoriLabel}<br>${MAPI18N.status}: <b>${statusLabel}</b><br><a href="${MAPI18N.urlPrefix}/laporan/${l.id}" style="color:#DC2626;font-weight:600;">${MAPI18N.viewDetails}</a></div>`, { autoPan: false });
    }));
  } else { LAYERS.laporan = L.layerGroup(); }

  document.querySelectorAll('[data-layer]').forEach(cb => {
    const key = cb.dataset.layer;
    if (!LAYERS[key]) return;
    if (cb.checked) LAYERS[key].addTo(map);
    cb.addEventListener('change', () => {
      if (cb.checked) {
        LAYERS[key].addTo(map);
        const opposite = EXCLUSIVE_PAIRS[key];
        if (opposite) {
          const oppCb = document.querySelector(`[data-layer="${opposite}"]`);
          if (oppCb && oppCb.checked) {
            oppCb.checked = false;
            if (LAYERS[opposite]) map.removeLayer(LAYERS[opposite]);
          }
        }
      } else {
        map.removeLayer(LAYERS[key]);
      }
    });
  });

  clearTimeout(failsafe);
  hideMapLoading(mapId);
  setTimeout(() => map.invalidateSize(), 200);
}