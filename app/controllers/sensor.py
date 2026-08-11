"""Endpoint API untuk ESP32 mengirim data sensor + endpoint internal untuk peta."""
from flask import Blueprint, request, jsonify, current_app

from app import db
from app.models.sensor import Sensor, DataSensor

sensor_bp = Blueprint("sensor", __name__)


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

    status = DataSensor.hitung_status(soil, roll, pitch)
    data = DataSensor(
        sensor_id=sensor.id,
        kelembapan=soil,
        roll=roll,
        pitch=pitch,
        status=status,
    )
    db.session.add(data)
    db.session.commit()

    return jsonify({
        "ok": True,
        "data": data.to_dict(),
        "sensor": {"id": sensor.id, "kode": sensor.kode_sensor},
    }), 201


@sensor_bp.route("/list", methods=["GET"])
def list_sensors():
    """Untuk peta — daftar sensor + status terkini (publik)."""
    items = []
    for s in Sensor.query.filter_by(is_active=True).all():
        latest = s.latest
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