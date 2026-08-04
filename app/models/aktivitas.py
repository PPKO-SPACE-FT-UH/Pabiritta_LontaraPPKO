"""Model Aktivitas — event log terpadu.

Menyimpan SEMUA event sistem (login/logout admin, buat laporan,
ubah status, tambah user, dll). Kolom opsional `laporan_id` +
`status_lama` / `status_baru` menghubungkan entry ke laporan tertentu
sehingga bisa dipakai sebagai timeline per-laporan tanpa perlu tabel terpisah.
"""
from datetime import datetime
from app import db


class Aktivitas(db.Model):
    __tablename__ = "aktivitas"

    id = db.Column(db.Integer, primary_key=True)

    # Pelaku
    aktor = db.Column(db.String(120), nullable=False)   # nama admin / nama warga / "Sistem"
    peran = db.Column(db.String(30), nullable=True)     # "warga" / "admin" / "superadmin" / "sistem"

    # Deskripsi event
    aksi = db.Column(db.String(255), nullable=False)
    keterangan = db.Column(db.Text, nullable=True)      # catatan bebas (mis. catatan tindak lanjut)

    # Link ke laporan (opsional — kalau event terkait laporan)
    laporan_id = db.Column(
        db.Integer,
        db.ForeignKey("laporan.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    status_lama = db.Column(db.String(30), nullable=True)
    status_baru = db.Column(db.String(30), nullable=True)

    created_at = db.Column(
        db.DateTime, default=datetime.utcnow, nullable=False, index=True
    )

    @property
    def status_color(self) -> str:
        return {
            "Menunggu": "yellow",
            "Proses": "blue",
            "Tindak Lanjut": "purple",
            "Selesai": "green",
            "Ditolak": "red",
        }.get(self.status_baru, "gray")

    @classmethod
    def log(
        cls,
        aktor: str,
        aksi: str,
        keterangan: str = None,
        peran: str = None,
        laporan_id: int = None,
        status_lama: str = None,
        status_baru: str = None,
    ) -> "Aktivitas":
        entry = cls(
            aktor=aktor,
            aksi=aksi,
            keterangan=keterangan,
            peran=peran,
            laporan_id=laporan_id,
            status_lama=status_lama,
            status_baru=status_baru,
        )
        db.session.add(entry)
        return entry

    def __repr__(self) -> str:
        return f"<Aktivitas {self.aktor} {self.aksi}>"