"""Service untuk menghitung status keseluruhan desa dari kondisi sensor."""
from app.models.sensor import Sensor, DataSensor


def hitung_status_desa() -> dict:
    """Status desa = status sensor terburuk (Bahaya > Waspada > Normal)."""
    sensors = Sensor.query.filter_by(is_active=True).all()

    priority = {
        DataSensor.STATUS_BAHAYA: 3,
        DataSensor.STATUS_WASPADA: 2,
        DataSensor.STATUS_NORMAL: 1,
    }
    worst = DataSensor.STATUS_NORMAL
    for s in sensors:
        st = s.status_terkini
        if priority.get(st, 0) > priority.get(worst, 0):
            worst = st

    mapping = {
        DataSensor.STATUS_NORMAL: {
            "key": "aman",
            "label": "AMAN",
            "warna": "green",
            "warna_hex": "#16A34A",
            "deskripsi": "Sensor kelembapan dan kemiringan tanah dalam batas normal.",
            "status_text": "AMAN TERKENDALI",
        },
        DataSensor.STATUS_WASPADA: {
            "key": "waspada",
            "label": "WASPADA",
            "warna": "yellow",
            "warna_hex": "#EAB308",
            "deskripsi": "Beberapa sensor menunjukkan nilai tinggi. Pantau terus kondisi.",
            "status_text": "WASPADA",
        },
        DataSensor.STATUS_BAHAYA: {
            "key": "bahaya",
            "label": "BAHAYA",
            "warna": "red",
            "warna_hex": "#DC2626",
            "deskripsi": "Sensor mendeteksi kondisi berbahaya. Segera evakuasi bila perlu.",
            "status_text": "BAHAYA",
        },
    }
    return mapping[worst]