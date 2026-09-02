"""Blueprint halaman publik (beranda, laporan warga, peta) + SEO endpoints."""
from datetime import datetime, timedelta

from flask import Blueprint, render_template, current_app, url_for, Response
from sqlalchemy import desc

from app.models.laporan import Laporan
from app.models.sensor import Sensor, DataSensor

public_bp = Blueprint("public", __name__)

STALE_AFTER = timedelta(minutes=10)
SITEMAP_LIMIT = 1000  # batas jumlah laporan yang di-include ke sitemap


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


@public_bp.route("/robots.txt")
def robots_txt():
    """Instruksi untuk web crawler (Google, Bing, dst)."""
    site_url = current_app.config.get("SITE_URL", "").rstrip("/")
    lines = [
        "User-agent: *",
        "Allow: /",
        "Disallow: /admin/",
        "Disallow: /api/",
        "",
        f"Sitemap: {site_url}/sitemap.xml",
        "",
    ]
    return Response("\n".join(lines), mimetype="text/plain")


@public_bp.route("/sitemap.xml")
def sitemap_xml():
    """Sitemap dinamis untuk Google Search Console.

    Mencantumkan halaman statis publik (ID + EN) dan semua detail laporan
    yang sudah dipublikasi (bukan status Menunggu). Setiap URL diberi
    hreflang alternate agar Google tahu versi ID dan EN adalah halaman
    yang sama dalam bahasa berbeda.
    """
    site_url = current_app.config.get("SITE_URL", "").rstrip("/")
    now = datetime.utcnow().strftime("%Y-%m-%d")

    entries = [
        {"path": url_for("public.beranda"),  "changefreq": "daily",   "priority": "1.0", "lastmod": now},
        {"path": url_for("public.peta"),     "changefreq": "weekly",  "priority": "0.9", "lastmod": now},
        {"path": url_for("laporan.daftar"),  "changefreq": "daily",   "priority": "0.9", "lastmod": now},
        {"path": url_for("laporan.buat"),    "changefreq": "monthly", "priority": "0.8", "lastmod": now},
    ]

    laporans = (
        Laporan.query
        .filter(Laporan.status != Laporan.STATUS_MENUNGGU)
        .order_by(desc(Laporan.updated_at))
        .limit(SITEMAP_LIMIT)
        .all()
    )
    for l in laporans:
        stamp = (l.updated_at or l.created_at).strftime("%Y-%m-%d")
        entries.append({
            "path": url_for("laporan.detail", laporan_id=l.id),
            "changefreq": "monthly",
            "priority": "0.6",
            "lastmod": stamp,
        })

    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
        '        xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ]
    for e in entries:
        id_url = f"{site_url}{e['path']}"
        en_url = f"{site_url}/en{e['path']}"
        for main_url in (id_url, en_url):
            lines.append("  <url>")
            lines.append(f"    <loc>{main_url}</loc>")
            lines.append(f"    <lastmod>{e['lastmod']}</lastmod>")
            lines.append(f"    <changefreq>{e['changefreq']}</changefreq>")
            lines.append(f"    <priority>{e['priority']}</priority>")
            lines.append(f'    <xhtml:link rel="alternate" hreflang="id" href="{id_url}"/>')
            lines.append(f'    <xhtml:link rel="alternate" hreflang="en" href="{en_url}"/>')
            lines.append(f'    <xhtml:link rel="alternate" hreflang="x-default" href="{id_url}"/>')
            lines.append("  </url>")
    lines.append("</urlset>")

    return Response("\n".join(lines), mimetype="application/xml")


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
            continue
        if latest.status in (DataSensor.STATUS_WASPADA, DataSensor.STATUS_BAHAYA):
            rawan += 1

    return {
        "total": total,
        "proses": proses,
        "selesai": selesai,
        "rawan": rawan,
    }