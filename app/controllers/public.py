"""Blueprint halaman publik (beranda, laporan warga, peta)."""
from datetime import datetime, timedelta

from flask import Blueprint, render_template
from sqlalchemy import desc

from app.models.laporan import Laporan
from app.models.sensor import Sensor, DataSensor

public_bp = Blueprint("public", __name__)

STALE_AFTER = timedelta(minutes=10)


@public_bp.route("/")
def beranda():
    laporan_terbaru = (
        Laporan.query
        .filter(Laporan.status != Laporan.STATUS_MENUNGGU)
        .order_by(desc(Laporan.created_at))
        .limit(5)
        .all()
    )
    sensors = Sensor.query.filter_by(is_active=True).all()
    stats = _hitung_statistik_publik()
    return render_template(
        "publik/beranda.html",
        laporan_terbaru=laporan_terbaru,
        sensors=sensors,
        stats=stats,
    )


@public_bp.route("/peta")
def peta():
    return render_template("publik/peta.html")


def _hitung_statistik_publik():
    total = Laporan.query.count()
    proses = Laporan.query.filter(
        Laporan.status.in_([Laporan.STATUS_PROSES, Laporan.STATUS_TINDAK_LANJUT])
    ).count()
    selesai = Laporan.query.filter_by(status=Laporan.STATUS_SELESAI).count()

    now = datetime.utcnow()
    rawan = 0
    for s in Sensor.query.filter_by(is_active=True).all():
        latest = s.latest
        if not latest or (now - latest.timestamp) > STALE_AFTER:
            continue  # sensor offline / belum ada data → tidak dihitung
        if latest.status in (DataSensor.STATUS_WASPADA, DataSensor.STATUS_BAHAYA):
            rawan += 1

    return {
        "total": total,
        "proses": proses,
        "selesai": selesai,
        "rawan": rawan,
    }