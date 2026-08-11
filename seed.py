"""Seed data Pa'Biritta.

Jalankan dengan:
    python seed.py

Menambahkan:
- 1 akun superadmin & 1 akun admin
- 5 contoh laporan warga dengan status bervariasi
- Aktivitas sistem contoh

Sensor IoT (Node B & C dari EWS) tidak di-seed di sini — didaftarkan
langsung di database produksi via migrations/001_ews_integration.sql.
"""
from datetime import datetime, timedelta

from app import create_app, db
from app.models.user import User
from app.models.laporan import Laporan
from app.models.aktivitas import Aktivitas


# Koordinat 4 dusun di Desa Lonjoboko, Parangloe, Gowa (perkiraan,
# tersebar di dalam bounding box data kerawanan longsor dari PWK)
DUSUN_KOORDINAT = {
    "Tombongi":     (-5.2530, 119.7100),  # barat laut
    "Galesong":     (-5.2760, 119.7200),  # barat daya
    "Kampung Beru": (-5.2600, 119.7450),  # tengah-timur
    "Bontoloe":     (-5.2780, 119.7600),  # tenggara
}


def seed_users():
    if User.query.count() > 0:
        print("• Users sudah ada — skip.")
        return
    superadmin = User(
        email="superadmin@pabiritta.id",
        nama="Super Admin",
        role=User.ROLE_SUPERADMIN,
        is_active=True,
    )
    superadmin.set_password("admin123")

    admin = User(
        email="admin@pabiritta.id",
        nama="Admin Budi",
        role=User.ROLE_ADMIN,
        is_active=True,
    )
    admin.set_password("admin123")

    db.session.add_all([superadmin, admin])
    db.session.commit()
    print("✓ Seed users: superadmin@pabiritta.id, admin@pabiritta.id (password: admin123)")


def seed_laporan():
    if Laporan.query.count() > 0:
        print("• Laporan sudah ada — skip.")
        return

    contoh = [
        {
            "kategori": Laporan.KAT_KEJADIAN,
            "lokasi_label": "Jl. Poros Desa, Dekat Jembatan",
            "dusun": "Galesong",
            "deskripsi": "Terjadi longsor menutupi setengah jalan poros desa setelah hujan deras semalaman. Kendaraan roda empat tidak bisa lewat.",
            "nama_pelapor": "Ahmad Rizki",
            "no_hp": "0811-2345-6789",
            "status": Laporan.STATUS_SELESAI,
            "hari_lalu": 30,
        },
        {
            "kategori": Laporan.KAT_POTENSI,
            "lokasi_label": "Dekat SD 01",
            "dusun": "Kampung Beru",
            "deskripsi": "Ada retakan tanah yang cukup memanjang di lereng bukit tepat di belakang sekolah. Sangat berbahaya jika hujan turun.",
            "nama_pelapor": "Siti Nurhaliza",
            "no_hp": "0822-3456-7890",
            "status": Laporan.STATUS_TINDAK_LANJUT,
            "hari_lalu": 25,
        },
        {
            "kategori": Laporan.KAT_DAMPAK,
            "lokasi_label": "Area Pertanian Warga",
            "dusun": "Galesong",
            "deskripsi": "Material longsoran kecil merusak saluran irigasi sawah warga. Air meluap ke jalan.",
            "nama_pelapor": "Budi Santoso",
            "no_hp": "0833-4567-8901",
            "status": Laporan.STATUS_PROSES,
            "hari_lalu": 20,
        },
        {
            "kategori": Laporan.KAT_POTENSI,
            "lokasi_label": "Tebing pinggir sungai",
            "dusun": "Bontoloe",
            "deskripsi": "Tanah di pinggir sungai mulai tergerus air, pohon bambu penahan sudah miring.",
            "nama_pelapor": "Dewi Lestari",
            "no_hp": "0844-5678-9012",
            "status": Laporan.STATUS_MENUNGGU,
            "hari_lalu": 15,
        },
        {
            "kategori": Laporan.KAT_KEJADIAN,
            "lokasi_label": "Jalan Setapak Kebun",
            "dusun": "Tombongi",
            "deskripsi": "Ada longsoran kecil di jalan kebun.",
            "nama_pelapor": "Hendra Wijaya",
            "no_hp": "0855-6789-0123",
            "status": Laporan.STATUS_DITOLAK,
            "hari_lalu": 10,
        },
    ]

    for c in contoh:
        lat, lng = DUSUN_KOORDINAT[c["dusun"]]
        # Sebar titik supaya tidak menumpuk
        lat += (hash(c["lokasi_label"]) % 100) / 10000
        lng += (hash(c["nama_pelapor"]) % 100) / 10000
        laporan = Laporan(
            foto_url=None,
            latitude=lat,
            longitude=lng,
            kategori=c["kategori"],
            deskripsi=c["deskripsi"],
            lokasi_label=c["lokasi_label"],
            nama_pelapor=c["nama_pelapor"],
            dusun=c["dusun"],
            no_hp=c.get("no_hp"),
            status=c["status"],
            created_at=datetime.utcnow() - timedelta(days=c["hari_lalu"]),
        )
        db.session.add(laporan)
    db.session.commit()
    print(f"✓ Seed {len(contoh)} contoh laporan warga")


def seed_aktivitas():
    if Aktivitas.query.count() > 0:
        print("• Aktivitas sudah ada — skip.")
        return
    items = [
        ("Admin Budi", "Mengubah Status Laporan (Ditolak)", "Laporan #5", 1),
        ("Sistem", "Menerima Laporan Baru", "Laporan dari Dewi Lestari", 3),
        ("Admin Joko", "Mengubah Status Laporan (Proses)", "Laporan #3", 5),
        ("Super Admin", "Menonaktifkan Pengguna", "Admin Joko", 8),
        ("Admin Siti", "Menambahkan Catatan Tindak Lanjut", "Laporan #2", 10),
    ]
    for aktor, aksi, ket, days in items:
        db.session.add(Aktivitas(
            aktor=aktor, aksi=aksi, keterangan=ket,
            created_at=datetime.utcnow() - timedelta(days=days),
        ))
    db.session.commit()
    print(f"✓ Seed {len(items)} entri aktivitas")


def main():
    app = create_app()
    with app.app_context():
        print("▶ Membuat tabel (jika belum ada)...")
        db.create_all()
        seed_users()
        seed_laporan()
        seed_aktivitas()
        print("\n✅ Seeding selesai.")
        print("\nLogin:")
        print("  Super Admin → superadmin@pabiritta.id / admin123")
        print("  Admin       → admin@pabiritta.id      / admin123")


if __name__ == "__main__":
    main()
