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
  sensor:      { fill: '#16A34A', border: '#15803D' },
  laporan:     { fill: '#2563EB', border: '#1E40AF' },
  evakuasi:    { fill: '#84CC16', border: '#4D7C0F' },
};

// Mapping icon file untuk layer point tunggal
const ICON_FILES = {
  historis:    'titik_longsor.svg',
  kumpul:      'titik_kumpul.svg',
  pendidikan:  'pendidikan.svg',
  peribadatan: 'peribadatan.svg'
};

// Mapping icon per kategori Potensi Desa (berdasarkan properties.Keterangan)
const POTENSI_ICON_MAP = {
  'Pabrik':        'pabrik.svg',
  'Tambang':       'tambang.svg',
  'Bumdes':        'bumdes.svg',
  'Kopdes':        'kopdes.svg',
  'Lapangan Desa': 'lapangan_desa.svg',
  'Pasar':         'pasar.svg',
};

function makeFileIcon(filename, size = 30) {
  return L.icon({
    iconUrl: `/static/img/icons/${filename}`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });
}

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
    zonaRes, lahanRes, historisRes, kumpulRes, evakuasiRes,
    pendidikanRes, peribadatanRes, potensiRes,
    sensorRes, laporanRes
  ] = await Promise.allSettled([
    safeJson('/static/data/kelas_rawan_longsor.geojson'),
    safeJson('/static/data/guna_lahan.geojson'),
    safeJson('/static/data/historis_longsor.geojson'),
    safeJson('/static/data/titik_kumpul.geojson'),
    safeJson('/static/data/jalur_evakuasi.geojson'),
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

  // GUNA LAHAN — warna dari ArcGIS
  if (lahanRes.status === 'fulfilled') {
    const palette = {
      'Permukiman':           { fillColor: '#EB9B3C', fillOpacity: 0.45 },
      'Persawahan':           { fillColor: '#A3FF73', fillOpacity: 0.45 },
      'Area Terbuka':         { fillColor: '#006969', fillOpacity: 0.45 },
      'Pertambangan':         { fillColor: '#5F7391', fillOpacity: 0.45 },
      'Hutan':                { fillColor: '#C7E0B0', fillOpacity: 0.45 },
      'Daerah Aliran Sungai': { fillColor: '#CCFFFF', fillOpacity: 0.45 },
    };
    LAYERS.gunalahan = L.geoJSON(lahanRes.value, {
      renderer: polygonRenderer, pane: 'shadowPane', interactive: false,
      style: (f) => {
        const s = palette[f.properties.Fungsi] || { fillColor: '#9CA3AF', fillOpacity: 0.35 };
        return { ...s, weight: 0, stroke: false };
      },
    });
  } else { LAYERS.gunalahan = L.layerGroup(); }

  // Helper: L.marker dgn icon file + popup
  const makeIconLayer = (data, iconFile, popupBuilder) => L.geoJSON(data, {
    pointToLayer: (feat, latlng) => L.marker(latlng, { icon: makeFileIcon(iconFile) }),
    onEachFeature: (feat, layer) => layer.bindPopup(popupBuilder(feat.properties || {}), { autoPan: false }),
  });

  // HISTORIS TITIK LONGSOR
  LAYERS.historis = historisRes.status === 'fulfilled'
    ? makeIconLayer(historisRes.value, ICON_FILES.historis, (p) => {
        const tahun = p.Tahun && p.Tahun > 0 ? p.Tahun : '-';
        return `<div style="min-width:180px;"><strong>${p.Keterangan || 'Titik Longsor'}</strong><br>Tahun: <b>${tahun}</b><br><span style="font-size:11px;color:#6b7280;">Sumber: Data Primer</span></div>`;
      })
    : L.layerGroup();

  // TITIK KUMPUL
  LAYERS.kumpul = kumpulRes.status === 'fulfilled'
    ? makeIconLayer(kumpulRes.value, ICON_FILES.kumpul, (p) => {
        const dusun = (p.Dusun || '').trim();
        return `<div style="min-width:180px;"><strong>${p.Keterangan || 'Titik Kumpul'}</strong><br>${dusun ? `${dusun}<br>` : ''}<span style="font-size:11px;color:#6b7280;">Sumber: Data Primer</span></div>`;
      })
    : L.layerGroup();

  // JALUR EVAKUASI (belum ada SVG, tetap pakai circleMarker lime)
  LAYERS.evakuasi = evakuasiRes.status === 'fulfilled'
    ? L.geoJSON(evakuasiRes.value, {
        pointToLayer: (feat, latlng) => {
          const st = POINT_STYLE.evakuasi;
          return L.circleMarker(latlng, {
            renderer: pointRenderer, pane: 'markerPane',
            radius: 7, color: st.border, fillColor: st.fill, fillOpacity: 0.85, weight: 2,
          });
        },
        onEachFeature: (feat, layer) => {
          const p = feat.properties || {};
          const dusun = (p.Dusun || '').trim();
          layer.bindPopup(`<div style="min-width:180px;"><strong>Titik Jalur Evakuasi</strong><br>${dusun ? `${dusun}<br>` : ''}<span style="font-size:11px;color:#6b7280;">Sumber: Data Primer</span></div>`, { autoPan: false });
        },
      })
    : L.layerGroup();

  // SARANA PENDIDIKAN
  LAYERS.pendidikan = pendidikanRes.status === 'fulfilled'
    ? makeIconLayer(pendidikanRes.value, ICON_FILES.pendidikan, (p) => {
        const nama = (p.Keterangan || '').trim();
        const dusun = (p.Dusun || '').trim();
        return `<div style="min-width:180px;"><strong>${nama || 'Sarana Pendidikan'}</strong><br>${dusun ? `${dusun}<br>` : ''}<span style="font-size:11px;color:#6b7280;">Sumber: Data Primer</span></div>`;
      })
    : L.layerGroup();

  // SARANA PERIBADATAN
  LAYERS.peribadatan = peribadatanRes.status === 'fulfilled'
    ? makeIconLayer(peribadatanRes.value, ICON_FILES.peribadatan, (p) => {
        const nama = (p.Keterangan || '').trim();
        const dusun = (p.Dusun || '').trim();
        return `<div style="min-width:180px;"><strong>${nama || 'Sarana Peribadatan'}</strong><br>${dusun ? `${dusun}<br>` : ''}<span style="font-size:11px;color:#6b7280;">Sumber: Data Primer</span></div>`;
      })
    : L.layerGroup();

  // POTENSI DESA — icon berbeda per kategori
  LAYERS.potensi = potensiRes.status === 'fulfilled'
    ? L.geoJSON(potensiRes.value, {
        pointToLayer: (feat, latlng) => {
          const keterangan = (feat.properties?.Keterangan || '').trim();
          const iconFile = POTENSI_ICON_MAP[keterangan];
          if (iconFile) {
            return L.marker(latlng, { icon: makeFileIcon(iconFile) });
          }
          // Fallback: lingkaran pink kalau kategori tidak dikenali
          return L.circleMarker(latlng, {
            renderer: pointRenderer, pane: 'markerPane',
            radius: 7, color: '#9D174D', fillColor: '#DB2777', fillOpacity: 0.85, weight: 2,
          });
        },
        onEachFeature: (feat, layer) => {
          const p = feat.properties || {};
          const kategori = (p.Keterangan || '').trim();
          const nama = (p.Nama || '').trim();
          const dusun = (p.Dusun || '').trim();
          const judul = nama || kategori || 'Potensi Desa';
          layer.bindPopup(`<div style="min-width:180px;"><strong>${judul}</strong><br>${nama && kategori ? `${kategori}<br>` : ''}${dusun ? `${dusun}<br>` : ''}<span style="font-size:11px;color:#6b7280;">Sumber: Data Primer</span></div>`, { autoPan: false });
        },
      })
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