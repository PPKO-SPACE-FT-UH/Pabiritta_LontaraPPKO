/**
 * Pa'Biritta — Peta interaktif Leaflet.
 *
 * Strategi layering (Paling Aman / Definitif):
 *   1. Menggunakan pane bawaan Leaflet untuk menghindari bug CSS/Tailwind.
 *   2. Poligon (Zona, Guna Lahan) dimasukkan ke 'shadowPane' (z-index: 250).
 *   3. Titik (Sensor, Laporan, dll) dimasukkan ke 'markerPane' (z-index: 600).
 *   4. Popup otomatis berada di 'popupPane' (z-index: 700).
 *   5. Pemisahan pane ini menjamin poligon SELALU berada di bawah titik dan popup.
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

  // Force (Tegaskan) z-index bawaan agar kebal dari bentrok CSS external
  map.getPane('shadowPane').style.zIndex = '250';
  map.getPane('overlayPane').style.zIndex = '400';
  map.getPane('markerPane').style.zIndex = '600';
  map.getPane('popupPane').style.zIndex = '700';

  // Pastikan poligon tidak menghalangi klik (pointer events) ke peta
  map.getPane('shadowPane').style.pointerEvents = 'none';

  // Tile TANPA bounds — supaya viewport yang lebih lebar tetap terisi tile,
  // tidak muncul area abu-abu di kiri/kanan. Panning tetap dibatasi maxBounds.
  const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap',
    minZoom: 13,
    maxZoom: 19,
  });

  const satelliteLayer = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    {
      attribution: 'Tiles © Esri — Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, dan komunitas GIS',
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

function popupFoto(filename) {
  const src = `/static/img/lokasi/${filename}`;
  return `<img src="${src}" alt=""
            onerror="this.style.display='none'"
            style="width:100%;height:120px;object-fit:cover;border-radius:6px;margin-bottom:8px;display:block;">`;
}

async function fetchAndRenderLayers(map) {
  // Siapkan renderer terpisah untuk poligon dan titik
  const polygonRenderer = L.svg({ pane: 'shadowPane' });
  const pointRenderer = L.svg({ pane: 'markerPane' });

  // ====== POLIGON (Berada di Bawah - z-index 250) ======

  // ZONA RAWAN LONGSOR
  try {
    const res = await fetch('/static/data/kelas_rawan_longsor.geojson');
    const gj = await res.json();
    const styleKelas = (kelas) => {
      if (kelas === 'Tinggi') return { fillColor: '#DC2626', weight: 0, stroke: false, fillOpacity: 0.55 };
      if (kelas === 'Sedang') return { fillColor: '#F97316', weight: 0, stroke: false, fillOpacity: 0.45 };
      return                       { fillColor: '#EAB308', weight: 0, stroke: false, fillOpacity: 0.35 };
    };
    LAYERS.zona = L.geoJSON(gj, {
      renderer: polygonRenderer,
      pane: 'shadowPane',
      interactive: false,
      style: (feature) => styleKelas(feature.properties.Kelas),
    });
  } catch (e) {
    console.warn('Gagal load zona rawan longsor:', e);
    LAYERS.zona = L.layerGroup();
  }

  // GUNA LAHAN
  try {
    const res = await fetch('/static/data/guna_lahan.geojson');
    const gj = await res.json();
    const styleFungsi = (fungsi) => {
      const palette = {
        'Permukiman':           { fillColor: '#EF4444', fillOpacity: 0.45 },
        'Persawahan':           { fillColor: '#22C55E', fillOpacity: 0.45 },
        'Area Terbuka':         { fillColor: '#FDE68A', fillOpacity: 0.55 },
        'Pertambangan':         { fillColor: '#78716C', fillOpacity: 0.55 },
        'Hutan':                { fillColor: '#166534', fillOpacity: 0.55 },
        'Daerah Aliran Sungai': { fillColor: '#3B82F6', fillOpacity: 0.55 },
      };
      const s = palette[fungsi] || { fillColor: '#9CA3AF', fillOpacity: 0.35 };
      return { ...s, weight: 0, stroke: false };
    };
    LAYERS.gunalahan = L.geoJSON(gj, {
      renderer: polygonRenderer,
      pane: 'shadowPane',
      interactive: false,
      style: (feat) => styleFungsi(feat.properties.Fungsi),
    });
  } catch (e) {
    console.warn('Gagal load guna lahan:', e);
    LAYERS.gunalahan = L.layerGroup();
  }

  // ====== TITIK (Berada di Atas - z-index 600) ======

  // HISTORIS TITIK LONGSOR
  try {
    const res = await fetch('/static/data/historis_longsor.geojson');
    const gj = await res.json();
    const st = POINT_STYLE.historis;
    LAYERS.historis = L.geoJSON(gj, {
      pointToLayer: (feat, latlng) => L.circleMarker(latlng, {
        renderer: pointRenderer,
        pane: 'markerPane',
        radius: 7, color: st.border, fillColor: st.fill, fillOpacity: 0.85, weight: 2,
      }),
      onEachFeature: (feat, layer) => {
        const p = feat.properties || {};
        const tahun = p.Tahun && p.Tahun > 0 ? p.Tahun : '-';
        layer.bindPopup(`
          <div style="min-width:180px;">
            <strong>${p.Keterangan || 'Titik Longsor'}</strong><br>
            Tahun kejadian: <b>${tahun}</b><br>
            <span style="font-size:11px;color:#6b7280;">Sumber: Data PWK</span>
          </div>`);
      },
    });
  } catch (e) {
    console.warn('Gagal load historis longsor:', e);
    LAYERS.historis = L.layerGroup();
  }

  // TITIK KUMPUL
  try {
    const res = await fetch('/static/data/titik_kumpul.geojson');
    const gj = await res.json();
    const st = POINT_STYLE.kumpul;
    LAYERS.kumpul = L.geoJSON(gj, {
      pointToLayer: (feat, latlng) => L.circleMarker(latlng, {
        renderer: pointRenderer,
        pane: 'markerPane',
        radius: 7, color: st.border, fillColor: st.fill, fillOpacity: 0.85, weight: 2,
      }),
      onEachFeature: (feat, layer) => {
        const p = feat.properties || {};
        layer.bindPopup(`
          <div style="min-width:180px;">
            <strong>${p.Keterangan || 'Titik Kumpul'}</strong><br>
            <span style="font-size:11px;color:#6b7280;">Sumber: Data PWK</span>
          </div>`);
      },
    });
  } catch (e) {
    console.warn('Gagal load titik kumpul:', e);
    LAYERS.kumpul = L.layerGroup();
  }

  // SARANA PENDIDIKAN
  try {
    const res = await fetch('/static/data/pendidikan.geojson');
    const gj = await res.json();
    const st = POINT_STYLE.pendidikan;
    LAYERS.pendidikan = L.geoJSON(gj, {
      pointToLayer: (feat, latlng) => L.circleMarker(latlng, {
        renderer: pointRenderer,
        pane: 'markerPane',
        radius: 7, color: st.border, fillColor: st.fill, fillOpacity: 0.85, weight: 2,
      }),
      onEachFeature: (feat, layer) => {
        layer.bindPopup(`
          <div style="min-width:160px;">
            <strong>Sarana Pendidikan</strong><br>
            <span style="font-size:11px;color:#6b7280;">Sumber: Data PWK</span>
          </div>`);
      },
    });
  } catch (e) {
    console.warn('Gagal load pendidikan:', e);
    LAYERS.pendidikan = L.layerGroup();
  }

  // SARANA PERIBADATAN
  try {
    const res = await fetch('/static/data/peribadatan.geojson');
    const gj = await res.json();
    const st = POINT_STYLE.peribadatan;
    LAYERS.peribadatan = L.geoJSON(gj, {
      pointToLayer: (feat, latlng) => L.circleMarker(latlng, {
        renderer: pointRenderer,
        pane: 'markerPane',
        radius: 7, color: st.border, fillColor: st.fill, fillOpacity: 0.85, weight: 2,
      }),
      onEachFeature: (feat, layer) => {
        layer.bindPopup(`
          <div style="min-width:160px;">
            <strong>Sarana Peribadatan</strong><br>
            <span style="font-size:11px;color:#6b7280;">Sumber: Data PWK</span>
          </div>`);
      },
    });
  } catch (e) {
    console.warn('Gagal load peribadatan:', e);
    LAYERS.peribadatan = L.layerGroup();
  }

  // POTENSI DESA
  try {
    const res = await fetch('/static/data/potensi_desa.geojson');
    const gj = await res.json();
    const st = POINT_STYLE.potensi;
    LAYERS.potensi = L.geoJSON(gj, {
      pointToLayer: (feat, latlng) => L.circleMarker(latlng, {
        renderer: pointRenderer,
        pane: 'markerPane',
        radius: 7, color: st.border, fillColor: st.fill, fillOpacity: 0.85, weight: 2,
      }),
      onEachFeature: (feat, layer) => {
        const p = feat.properties || {};
        layer.bindPopup(`
          <div style="min-width:180px;">
            <strong>${p.Keterangan || 'Potensi Desa'}</strong><br>
            <span style="font-size:11px;color:#6b7280;">Sumber: Data PWK</span>
          </div>`);
      },
    });
  } catch (e) {
    console.warn('Gagal load potensi desa:', e);
    LAYERS.potensi = L.layerGroup();
  }

  // SENSOR IoT
  try {
    const res = await fetch('/api/sensor/list');
    const data = await res.json();
    LAYERS.sensor = L.layerGroup(
      data.map(s => {
        const fill   = s.status === 'Bahaya'  ? '#B91C1C'
                     : s.status === 'Waspada' ? '#EAB308'
                     :                          POINT_STYLE.sensor.fill;
        const stroke = s.status === 'Bahaya'  ? '#7F1D1D'
                     : s.status === 'Waspada' ? '#854D0E'
                     :                          POINT_STYLE.sensor.border;
        return L.circleMarker([s.latitude, s.longitude], {
          renderer: pointRenderer,
          pane: 'markerPane',
          radius: 9, color: stroke, fillColor: fill, fillOpacity: 0.85, weight: 2,
        }).bindPopup(`
          <strong>${s.kode} — ${s.nama_lokasi}</strong><br>
          Status: <b>${s.status}</b><br>
          Kelembapan: ${s.kelembapan ?? '-'}%<br>
          Getaran: ${s.getaran ?? '-'}
        `);
      })
    );
  } catch (e) {
    LAYERS.sensor = L.layerGroup();
  }

  // LAPORAN WARGA
  try {
    const res = await fetch('/api/sensor/laporan-titik');
    const data = await res.json();
    const valid = data.filter(l => l.latitude != null && l.longitude != null);
    const st = POINT_STYLE.laporan;
    const markers = valid.map(l => {
      const foto = l.foto_url
        ? `<img src="${l.foto_url}" alt=""
             style="width:100%;height:120px;object-fit:cover;border-radius:6px;margin-bottom:8px;display:block;">`
        : '';
      return L.circleMarker([l.latitude, l.longitude], {
        renderer: pointRenderer,
        pane: 'markerPane',
        radius: 7, color: st.border, fillColor: st.fill, fillOpacity: 0.85, weight: 2,
      }).bindPopup(`
        <div style="min-width:200px;">
          ${foto}
          <strong>${l.lokasi_label}</strong><br>
          ${l.kategori}<br>
          Status: <b>${l.status}</b><br>
          <a href="/laporan/${l.id}" style="color:#DC2626;font-weight:600;">Lihat Detail →</a>
        </div>
      `);
    });
    LAYERS.laporan = L.layerGroup(markers);
  } catch (e) {
    LAYERS.laporan = L.layerGroup();
  }

  // Hubungkan checkbox
  document.querySelectorAll('[data-layer]').forEach(cb => {
    const key = cb.dataset.layer;
    if (!LAYERS[key]) return;

    if (cb.checked) LAYERS[key].addTo(map);

    cb.addEventListener('change', () => {
      if (cb.checked) {
        LAYERS[key].addTo(map);

        // Logika Toggle Exclusive (Misal: Zona <--> Guna Lahan)
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

  setTimeout(() => map.invalidateSize(), 200);
}