/**
 * Pa'Biritta — Peta interaktif Leaflet.
 * Dipakai di Beranda, Dashboard Admin & Super Admin.
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

  // Basemap: Default (OpenStreetMap)
  const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap',
    minZoom: 13,
    maxZoom: 19,
    bounds: LONJOBOKO_BOUNDS,
  });

  // Basemap: Satelit (Esri World Imagery)
  const satelliteLayer = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    {
      attribution: 'Tiles © Esri | Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, dan komunitas GIS',
      minZoom: 13,
      maxZoom: 19,
      bounds: LONJOBOKO_BOUNDS,
    }
  );

  osmLayer.addTo(map);

  // Toggle basemap di pojok kanan atas peta
  L.control.layers(
    { 'Default': osmLayer, 'Satelit': satelliteLayer },
    null,
    { position: 'topright', collapsed: true }
  ).addTo(map);

  return map;
}

/** Layer-layer map yang bisa di-toggle */
const LAYERS = {};

/** Pasangan layer yang tidak boleh aktif bersamaan (biar tidak numpuk visual) */
const EXCLUSIVE_PAIRS = { zona: 'gunalahan', gunalahan: 'zona' };

/** Helper: bikin blok foto untuk popup. */
function popupFoto(filename) {
  const src = `/static/img/lokasi/${filename}`;
  return `<img src="${src}" alt=""
            onerror="this.style.display='none'"
            style="width:100%;height:120px;object-fit:cover;border-radius:6px;margin-bottom:8px;display:block;">`;
}

async function fetchAndRenderLayers(map) {
  // ZONA RAWAN LONGSOR — dari data PWK
  try {
    const res = await fetch('/static/data/kelas_rawan_longsor.geojson');
    const gj = await res.json();

    const styleKelas = (kelas) => {
      if (kelas === 'Tinggi') return { fillColor: '#DC2626', weight: 0, stroke: false, fillOpacity: 0.55 };
      if (kelas === 'Sedang') return { fillColor: '#F97316', weight: 0, stroke: false, fillOpacity: 0.45 };
      return                       { fillColor: '#EAB308', weight: 0, stroke: false, fillOpacity: 0.35 };
    };

    LAYERS.zona = L.geoJSON(gj, {
      style: (feature) => styleKelas(feature.properties.Kelas),
      onEachFeature: (feature, layer) => {
        const p = feature.properties || {};
        layer.bindPopup(`
          <div style="min-width:160px;">
            <strong>Zona Rawan Longsor</strong><br>
            Kelas kerawanan: <b>${p.Kelas || '-'}</b><br>
            <span style="font-size:11px;color:#6b7280;">Sumber: Data PWK</span>
          </div>
        `);
      },
    });
  } catch (e) {
    console.warn('Gagal load zona rawan longsor:', e);
    LAYERS.zona = L.layerGroup();
  }

  // GUNA LAHAN — polygon fungsi lahan
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
      style: (feat) => styleFungsi(feat.properties.Fungsi),
      onEachFeature: (feat, layer) => {
        const p = feat.properties || {};
        layer.bindPopup(`
          <div style="min-width:160px;">
            <strong>Guna Lahan</strong><br>
            Fungsi: <b>${p.Fungsi || '-'}</b><br>
            <span style="font-size:11px;color:#6b7280;">Sumber: Data PWK</span>
          </div>`);
      },
    });
  } catch (e) {
    console.warn('Gagal load guna lahan:', e);
    LAYERS.gunalahan = L.layerGroup();
  }

  // HISTORIS TITIK LONGSOR
  try {
    const res = await fetch('/static/data/historis_longsor.geojson');
    const gj = await res.json();
    LAYERS.historis = L.geoJSON(gj, {
      pointToLayer: (feat, latlng) => L.circleMarker(latlng, {
        radius: 6, color: '#7C2D12', fillColor: '#B45309', fillOpacity: 0.85, weight: 2,
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
    LAYERS.kumpul = L.geoJSON(gj, {
      pointToLayer: (feat, latlng) => L.circleMarker(latlng, {
        radius: 8, color: '#10B981', fillColor: '#10B981', fillOpacity: 0.9, weight: 2,
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

  // SENSOR IoT (live)
  try {
    const res = await fetch('/api/sensor/list');
    const data = await res.json();
    LAYERS.sensor = L.layerGroup(
      data.map(s => {
        const color = s.status === 'Bahaya' ? '#B91C1C'
                    : s.status === 'Waspada' ? '#EAB308'
                    : '#DC2626';
        return L.circleMarker([s.latitude, s.longitude], {
          radius: 9, color, fillColor: color, fillOpacity: 0.85, weight: 2,
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

  // LAPORAN WARGA (dari laporan yang diverifikasi)
  try {
    const res = await fetch('/api/sensor/laporan-titik');
    const data = await res.json();
    const valid = data.filter(l => l.latitude != null && l.longitude != null);
    const markers = valid.map(l => {
      const foto = l.foto_url
        ? `<img src="${l.foto_url}" alt=""
             style="width:100%;height:120px;object-fit:cover;border-radius:6px;margin-bottom:8px;display:block;">`
        : '';
      return L.circleMarker([l.latitude, l.longitude], {
        radius: 7, color: '#2563EB', fillColor: '#2563EB', fillOpacity: 0.8, weight: 2,
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

  // Hubungkan checkbox ke layer + logika mutually exclusive
  document.querySelectorAll('[data-layer]').forEach(cb => {
    const key = cb.dataset.layer;
    if (!LAYERS[key]) return;
    if (cb.checked) LAYERS[key].addTo(map);
    cb.addEventListener('change', () => {
      if (cb.checked) {
        LAYERS[key].addTo(map);
        // Jika layer punya "musuh", matikan yang satunya
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