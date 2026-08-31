"""Endpoint API untuk ESP32 mengirim data sensor + endpoint internal untuk peta."""
from datetime import datetime, timedelta

from flask import Blueprint, request, jsonify, current_app

from app import db
from app.models.sensor import Sensor, DataSensor
from app.services.whatsapp import kirim_notifikasi_ews

sensor_bp = Blueprint("sensor", __name__)

# Sensor dianggap offline kalau tidak ada bacaan baru dalam window ini.
STALE_AFTER = timedelta(minutes=10)


def _validate_api_key() -> bool:
    key = request.headers.get("X-API-Key") or request.headers.get("X-Api-Key")
    return key and key == current_app.config["SENSOR_API_KEY"]


def _to_float(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


@sensor_bp.route("/data", methods=["POST"])
def terima_data():
    """Terima pembacaan dari ESP32 (Alat A).

    Header: X-API-Key: <rahasia>
    Body JSON: { "sensor_id": "B", "soil": 45.2, "roll": 2.1, "pitch": -1.4 }
    """
    if not _validate_api_key():
        return jsonify({"error": "API Key tidak valid"}), 401

    payload = request.get_json(silent=True) or {}
    kode = (payload.get("sensor_id") or "").strip()
    soil = _to_float(payload.get("soil"))
    roll = _to_float(payload.get("roll"))
    pitch = _to_float(payload.get("pitch"))

    if not kode or soil is None or roll is None or pitch is None:
        return jsonify({
            "error": "Field wajib: sensor_id, soil, roll, pitch (semua numerik)"
        }), 400

    sensor = Sensor.query.filter_by(kode_sensor=kode).first()
    if not sensor:
        return jsonify({"error": f"Sensor {kode} tidak terdaftar"}), 404

    # 1. Ambil status sebelumnya (LOGIKA ANTI-SPAM)
    status_sebelumnya = sensor.status_terkini

    # 2. Hitung status terbaru berdasarkan data yang masuk
    status_terbaru = DataSensor.hitung_status(soil, roll, pitch)
    
    data = DataSensor(
        sensor_id=sensor.id,
        kelembapan=soil,
        roll=roll,
        pitch=pitch,
        status=status_terbaru,
    )
    db.session.add(data)
    db.session.commit()

    # 3. LOGIKA PENGIRIMAN WHATSAPP KE GRUP
    # Syarat: Hanya kirim WA jika statusnya Waspada/Bahaya DAN statusnya berubah memburuk
    # Ini penting agar grup WA tidak dibombardir ratusan pesan setiap detik oleh alat sensor
    if status_terbaru in [DataSensor.STATUS_WASPADA, DataSensor.STATUS_BAHAYA] and status_terbaru != status_sebelumnya:
        kirim_notifikasi_ews(
            nama_lokasi=sensor.nama_lokasi,
            status=status_terbaru,
            kelembapan=soil,
            roll=roll,
            pitch=pitch
        )

    return jsonify({
        "ok": True,
        "data": data.to_dict(),
        "sensor": {"id": sensor.id, "kode": sensor.kode_sensor},
    }), 201

    return jsonify({
        "ok": True,
        "data": data.to_dict(),
        "sensor": {"id": sensor.id, "kode": sensor.kode_sensor},
    }), 201


@sensor_bp.route("/list", methods=["GET"])
def list_sensors():
    """Untuk peta — daftar sensor + status terkini (publik)."""
    items = []
    now = datetime.utcnow()
    for s in Sensor.query.filter_by(is_active=True).all():
        latest = s.latest
        is_stale = (latest is None) or ((now - latest.timestamp) > STALE_AFTER)
        items.append({
            "id": s.id,
            "kode": s.kode_sensor,
            "nama_lokasi": s.nama_lokasi,
            "latitude": s.latitude,
            "longitude": s.longitude,
            "status": latest.status if latest else "Normal",
            "kelembapan": latest.kelembapan if latest else None,
            "roll": latest.roll if latest else None,
            "pitch": latest.pitch if latest else None,
            "is_stale": is_stale,
            "last_seen": latest.timestamp.isoformat() if latest else None,
        })
    return jsonify(items)


@sensor_bp.route("/laporan-titik", methods=["GET"])
def titik_laporan():
    """Untuk peta — titik laporan yang sudah diverifikasi."""
    from app.models.laporan import Laporan
    items = []
    laporans = Laporan.query.filter(
        Laporan.status != Laporan.STATUS_MENUNGGU,
    ).all()
    for l in laporans:
        items.append({
            "id": l.id,
            "latitude": l.latitude,
            "longitude": l.longitude,
            "kategori": l.kategori,
            "lokasi_label": l.lokasi_label or l.dusun,
            "status": l.status,
            "foto_url": l.foto_url,
        })
    return jsonify(items)