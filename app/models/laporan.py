"""Model Laporan warga."""
from datetime import datetime
from app import db


class Laporan(db.Model):
    __tablename__ = "laporan"

    KAT_POTENSI = "Potensi Longsor"
    KAT_KEJADIAN = "Kejadian Longsor"
    KAT_DAMPAK = "Dampak Longsor"
    KATEGORI_CHOICES = [KAT_POTENSI, KAT_KEJADIAN, KAT_DAMPAK]

    STATUS_MENUNGGU = "Menunggu"
    STATUS_PROSES = "Proses"
    STATUS_TINDAK_LANJUT = "Tindak Lanjut"
    STATUS_SELESAI = "Selesai"
    STATUS_DITOLAK = "Ditolak"
    STATUS_CHOICES = [
        STATUS_MENUNGGU,
        STATUS_PROSES,
        STATUS_TINDAK_LANJUT,
        STATUS_SELESAI,
        STATUS_DITOLAK,
    ]

    id = db.Column(db.Integer, primary_key=True)
    foto_url = db.Column(db.String(255), nullable=True)
    latitude = db.Column(db.Float, nullable=False)
    longitude = db.Column(db.Float, nullable=False)
    kategori = db.Column(db.String(40), nullable=False)
    deskripsi = db.Column(db.Text, nullable=False)
    lokasi_label = db.Column(db.String(200), nullable=True)
    nama_pelapor = db.Column(db.String(120), nullable=False)
    dusun = db.Column(db.String(80), nullable=False)
    no_hp = db.Column(db.String(30), nullable=True)
    status = db.Column(db.String(30), nullable=False, default=STATUS_MENUNGGU)
    catatan_admin = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False, index=True)
    updated_at = db.Column(
        db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )

    # Riwayat penanganan = semua Aktivitas yang link ke laporan ini,
    # urut kronologis. Sekaligus jadi source of truth timeline transparansi.
    aktivitas = db.relationship(
        "Aktivitas",
        backref="laporan",
        primaryjoin="Aktivitas.laporan_id == Laporan.id",
        foreign_keys="Aktivitas.laporan_id",
        order_by="Aktivitas.created_at.asc()",
        lazy="select",
    )

    @property
    def status_color(self) -> str:
        return {
            self.STATUS_MENUNGGU: "yellow",
            self.STATUS_PROSES: "blue",
            self.STATUS_TINDAK_LANJUT: "purple",
            self.STATUS_SELESAI: "green",
            self.STATUS_DITOLAK: "red",
        }.get(self.status, "gray")

    @property
    def kategori_color(self) -> str:
        return {
            self.KAT_POTENSI: "orange",
            self.KAT_KEJADIAN: "red",
            self.KAT_DAMPAK: "blue",
        }.get(self.kategori, "gray")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "foto_url": self.foto_url,
            "latitude": self.latitude,
            "longitude": self.longitude,
            "kategori": self.kategori,
            "deskripsi": self.deskripsi,
            "lokasi_label": self.lokasi_label,
            "nama_pelapor": self.nama_pelapor,
            "dusun": self.dusun,
            "status": self.status,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }

    def __repr__(self) -> str:
        return f"<Laporan {self.id} {self.kategori} {self.status}>"