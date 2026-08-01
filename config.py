"""Konfigurasi aplikasi Pa'Biritta.

Semua nilai sensitif dibaca dari environment variable (.env).
"""
import os
from dotenv import load_dotenv

load_dotenv()

BASE_DIR = os.path.abspath(os.path.dirname(__file__))


class Config:
    SECRET_KEY = os.environ.get("SECRET_KEY", "dev-secret-key-ganti-di-produksi")

    # Database
    SQLALCHEMY_DATABASE_URI = os.environ.get(
        "DATABASE_URL",
        "postgresql://postgres:postgres@localhost:5432/pabiritta",
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {
        "pool_pre_ping": True,
        "pool_recycle": 300,
    }

    # Upload
    UPLOAD_FOLDER = os.environ.get(
        "UPLOAD_FOLDER",
        "/tmp/uploads" if os.environ.get("VERCEL") else os.path.join(BASE_DIR, "static", "uploads"),
    )
    MAX_UPLOAD_MB = int(os.environ.get("MAX_UPLOAD_MB", 5))
    MAX_CONTENT_LENGTH = MAX_UPLOAD_MB * 1024 * 1024
    ALLOWED_EXTENSIONS = {"jpg", "jpeg", "png"}

    # API Key untuk endpoint sensor (ESP32)
    SENSOR_API_KEY = os.environ.get("SENSOR_API_KEY", "ganti-api-key-ini")

    # Threshold sensor (longsor)
    THRESHOLD_KELEMBAPAN_WASPADA = 80
    THRESHOLD_KELEMBAPAN_BAHAYA = 90

    # Session
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = "Lax"
    REMEMBER_COOKIE_HTTPONLY = True


class DevelopmentConfig(Config):
    DEBUG = True


class ProductionConfig(Config):
    DEBUG = False
    SESSION_COOKIE_SECURE = True
    REMEMBER_COOKIE_SECURE = True


config_by_name = {
    "development": DevelopmentConfig,
    "production": ProductionConfig,
}


def get_config():
    env = os.environ.get("FLASK_ENV", "development")
    return config_by_name.get(env, DevelopmentConfig)