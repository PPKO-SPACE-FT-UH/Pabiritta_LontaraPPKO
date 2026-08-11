"""Model Sensor IoT dan pembacaan data sensor."""
from datetime import datetime
from app import db


class Sensor(db.Model):
    __tablename__ = "sensor"

    id = db.Column(db.Integer, primary_key=True)
    kode_sensor = db.Column(db.String(20), unique=True, nullable=False, index=True)
    nama_lokasi = db.Column(db.String(120), nullable=False)
    latitude = db.Column(db.Float, nullable=False)
    longitude = db.Column(db.Float, nullable=False)
    is_active = db.Column(db.Boolean, default=True, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)

    data = db.relationship(
        "DataSensor",
        backref="sensor",
        lazy="dynamic",
        cascade="all, delete-orphan",
        order_by="desc(DataSensor.timestamp)",
    )

    @property
    def latest(self):
        """Bacaan terakhir dari sensor ini."""
        return self.data.first()

    @property
    def status_terkini(self) -> str:
        latest = self.latest
        return latest.status if latest else "Normal"

    def __repr__(self) -> str:
        return f"<Sensor {self.kode_sensor} {self.nama_lokasi}>"


class DataSensor(db.Model):
    __tablename__ = "data_sensor"

    STATUS_NORMAL = "Normal"
    STATUS_WASPADA = "Waspada"
    STATUS_BAHAYA = "Bahaya"

    id = db.Column(db.Integer, primary_key=True)
    sensor_id = db.Column(db.Integer, db.ForeignKey("sensor.id"), nullable=False, index=True)
    kelembapan = db.Column(db.Float, nullable=False)  # soil moisture (%)
    roll = db.Column(db.Float, nullable=False)        # kemiringan samping (derajat)
    pitch = db.Column(db.Float, nullable=False)       # kemiringan depan-belakang (derajat)
    status = db.Column(db.String(20), nullable=False, default=STATUS_NORMAL)
    timestamp = db.Column(db.DateTime, default=datetime.utcnow, nullable=False, index=True)

    @staticmethod
    def hitung_status(kelembapan: float, roll: float, pitch: float) -> str:
        """Tentukan status berdasarkan kelembapan tanah dan kemiringan maksimum."""
        kemiringan = max(abs(roll), abs(pitch))
        if kelembapan > 90 or kemiringan > 25:
            return DataSensor.STATUS_BAHAYA
        if kelembapan > 80 or kemiringan > 15:
            return DataSensor.STATUS_WASPADA
        return DataSensor.STATUS_NORMAL

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "sensor_id": self.sensor_id,
            "kelembapan": self.kelembapan,
            "roll": self.roll,
            "pitch": self.pitch,
            "status": self.status,
            "timestamp": self.timestamp.isoformat() if self.timestamp else None,
        }

    def __repr__(self) -> str:
        return f"<DataSensor s={self.sensor_id} {self.status}>"