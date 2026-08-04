/**
 * Pa'Biritta — Peta interaktif Leaflet.
 * Strategi layer via pane bawaan supaya poligon selalu di bawah titik & popup.
 */

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
  sensor:      { fill: '#DC2626', border: '#991B1B' },
  laporan:     { fill: '#2563EB', border: '#1E40AF' },
  historis:    { fill: '#B45309', border: '#78350F' },
  kumpul:      { fill: '#059669', border: '#065F46' },
  pendidikan:  { fill: '#7C3AED', border: '#5B21B6' },
  peribadatan: { fill: '#0891B2', border: '#155E75' },
  potensi:     { fill: '#DB2777', border: '#9D174D' },
};

// Ambil JSON dgn timeout, aman kalau gagal
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
  const pointRenderer   = L.svg({ pane: 'markerPane' });

  // Failsafe: max 30s, overlay pasti hilang meski koneksi mati
  const failsafe = setTimeout(() => hideMapLoading(mapId), 30000);

  // Semua fetch berjalan paralel
  const [
    zonaRes, lahanRes, historisRes, kumpulRes,
    pendidikanRes, peribadatanRes, potensiRes,
    sensorRes, laporanRes,
  ] = await Promise.allSettled([
    safeJson('/static/data/kelas_rawan_longsor.geojson'),
    safeJson('/static/data/guna_lahan.geojson'),
    safeJson('/static/data/historis_longsor.geojson'),
    safeJson('/static/data/titik_kumpul.geojson'),
    safeJson('/static/data/pendidikan.geojson'),
    safeJson('/static/data/peribadatan.geojson'),
    safeJson('/static/data/potensi_desa.geojson'),
    safeJson('/api/sensor/list'),
    safeJson('/api/sensor/laporan-titik'),
  ]);

  // ZONA RAWAN
  if (zonaRes.status === 'fulfilled') {
    const styleKelas = (k) => k === 'Tinggi' ? { fillColor: '#DC2626', fillOpacity: 0.55 }
                            : k === 'Sedang' ? { fillColor: '#F97316', fillOpacity: 0.45 }
                            :                  { fillColor: '#EAB308', fillOpacity: 0.35 };
    LAYERS.zona = L.geoJSON(zonaRes.value, {
      renderer: polygonRenderer, pane: 'shadowPane', interactive: false,
      style: (f) => ({ ...styleKelas(f.properties.Kelas), weight: 0, stroke: false }),
    });
  } else { LAYERS.zona = L.layerGroup(); }

  // GUNA LAHAN
  if (lahanRes.status === 'fulfilled') {
    const palette = {
      'Permukiman':           { fillColor: '#EF4444', fillOpacity: 0.45 },
      'Persawahan':           { fillColor: '#22C55E', fillOpacity: 0.45 },
      'Area Terbuka':         { fillColor: '#FDE68A', fillOpacity: 0.55 },
      'Pertambangan':         { fillColor: '#78716C', fillOpacity: 0.55 },
      'Hutan':                { fillColor: '#166534', fillOpacity: 0.55 },
      'Daerah Aliran Sungai': { fillColor: '#3B82F6', fillOpacity: 0.55 },
    };
    LAYERS.gunalahan = L.geoJSON(lahanRes.value, {
      renderer: polygonRenderer, pane: 'shadowPane', interactive: false,
      style: (f) => {
        const s = palette[f.properties.Fungsi] || { fillColor: '#9CA3AF', fillOpacity: 0.35 };
        return { ...s, weight: 0, stroke: false };
      },
    });
  } else { LAYERS.gunalahan = L.layerGroup(); }

  // Helper titik generik
  const makePoint = (gj, styleKey, popupBuilder) => {
    const st = POINT_STYLE[styleKey];
    return L.geoJSON(gj, {
      pointToLayer: (feat, latlng) => L.circleMarker(latlng, {
        renderer: pointRenderer, pane: 'markerPane',
        radius: 7, color: st.border, fillColor: st.fill, fillOpacity: 0.85, weight: 2,
      }),
      onEachFeature: (feat, layer) => layer.bindPopup(popupBuilder(feat.properties || {}), { autoPan: false }),
    });
  };

  LAYERS.historis = historisRes.status === 'fulfilled'
    ? makePoint(historisRes.value, 'historis', (p) => {
        const tahun = p.Tahun && p.Tahun > 0 ? p.Tahun : '-';
        return `<div style="min-width:180px;"><strong>${p.Keterangan || 'Titik Longsor'}</strong><br>Tahun: <b>${tahun}</b><br><span style="font-size:11px;color:#6b7280;">Sumber: Data PWK</span></div>`;
      })
    : L.layerGroup();

  LAYERS.kumpul = kumpulRes.status === 'fulfilled'
    ? makePoint(kumpulRes.value, 'kumpul', (p) => `<div style="min-width:180px;"><strong>${p.Keterangan || 'Titik Kumpul'}</strong><br><span style="font-size:11px;color:#6b7280;">Sumber: Data PWK</span></div>`)
    : L.layerGroup();

  LAYERS.pendidikan = pendidikanRes.status === 'fulfilled'
    ? makePoint(pendidikanRes.value, 'pendidikan', () => `<div style="min-width:160px;"><strong>Sarana Pendidikan</strong><br><span style="font-size:11px;color:#6b7280;">Sumber: Data PWK</span></div>`)
    : L.layerGroup();

  LAYERS.peribadatan = peribadatanRes.status === 'fulfilled'
    ? makePoint(peribadatanRes.value, 'peribadatan', () => `<div style="min-width:160px;"><strong>Sarana Peribadatan</strong><br><span style="font-size:11px;color:#6b7280;">Sumber: Data PWK</span></div>`)
    : L.layerGroup();

  LAYERS.potensi = potensiRes.status === 'fulfilled'
    ? makePoint(potensiRes.value, 'potensi', (p) => `<div style="min-width:180px;"><strong>${p.Keterangan || 'Potensi Desa'}</strong><br><span style="font-size:11px;color:#6b7280;">Sumber: Data PWK</span></div>`)
    : L.layerGroup();

  // SENSOR IoT
  if (sensorRes.status === 'fulfilled') {
    LAYERS.sensor = L.layerGroup(
      sensorRes.value.map(s => {
        const fill   = s.status === 'Bahaya' ? '#B91C1C' : s.status === 'Waspada' ? '#EAB308' : POINT_STYLE.sensor.fill;
        const stroke = s.status === 'Bahaya' ? '#7F1D1D' : s.status === 'Waspada' ? '#854D0E' : POINT_STYLE.sensor.border;
        return L.circleMarker([s.latitude, s.longitude], {
          renderer: pointRenderer, pane: 'markerPane',
          radius: 9, color: stroke, fillColor: fill, fillOpacity: 0.85, weight: 2,
        }).bindPopup(`<strong>${s.kode} — ${s.nama_lokasi}</strong><br>Status: <b>${s.status}</b><br>Kelembapan: ${s.kelembapan ?? '-'}%<br>Getaran: ${s.getaran ?? '-'}`, { autoPan: false });
      })
    );
  } else { LAYERS.sensor = L.layerGroup(); }

  // LAPORAN WARGA
  if (laporanRes.status === 'fulfilled') {
    const valid = laporanRes.value.filter(l => l.latitude != null && l.longitude != null);
    const st = POINT_STYLE.laporan;
    LAYERS.laporan = L.layerGroup(valid.map(l => {
      const foto = l.foto_url
        ? `<img src="${l.foto_url}" loading="lazy" alt="" style="width:100%;height:120px;object-fit:cover;border-radius:6px;margin-bottom:8px;display:block;">`
        : '';
      return L.circleMarker([l.latitude, l.longitude], {
        renderer: pointRenderer, pane: 'markerPane',
        radius: 7, color: st.border, fillColor: st.fill, fillOpacity: 0.85, weight: 2,
      }).bindPopup(`<div style="min-width:200px;">${foto}<strong>${l.lokasi_label}</strong><br>${l.kategori}<br>Status: <b>${l.status}</b><br><a href="/laporan/${l.id}" style="color:#DC2626;font-weight:600;">Lihat Detail →</a></div>`, { autoPan: false });
    }));
  } else { LAYERS.laporan = L.layerGroup(); }

  // Hubungkan checkbox
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