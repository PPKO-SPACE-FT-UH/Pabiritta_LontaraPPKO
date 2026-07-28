"""App factory Pa'Biritta."""
import os
import cloudinary
from flask import Flask, render_template
from flask_sqlalchemy import SQLAlchemy
from flask_login import LoginManager
from flask_wtf.csrf import CSRFProtect

from config import get_config

db = SQLAlchemy()
login_manager = LoginManager()
csrf = CSRFProtect()


def create_app(config_class=None):
    app = Flask(
        __name__,
        template_folder="views",
        static_folder="static",
    )
    app.config.from_object(config_class or get_config())

    # Pastikan folder upload ada (di Vercel filesystem read-only, ignore error)
    try:
        os.makedirs(app.config["UPLOAD_FOLDER"], exist_ok=True)
    except OSError:
        pass

    # Konfigurasi Cloudinary
    cloudinary.config(
        cloud_name=os.environ.get("CLOUDINARY_CLOUD_NAME"),
        api_key=os.environ.get("CLOUDINARY_API_KEY"),
        api_secret=os.environ.get("CLOUDINARY_API_SECRET"),
    )

    # Init extensions
    db.init_app(app)
    csrf.init_app(app)
    login_manager.init_app(app)
    login_manager.login_view = "auth.login"
    login_manager.login_message = "Silakan login terlebih dahulu."
    login_manager.login_message_category = "warning"

    # Import models supaya terdaftar ke SQLAlchemy
    from app.models.user import User  # noqa: F401
    from app.models.laporan import Laporan  # noqa: F401
    from app.models.sensor import Sensor, DataSensor  # noqa: F401
    from app.models.aktivitas import Aktivitas  # noqa: F401

    @login_manager.user_loader
    def load_user(user_id):
        return User.query.get(int(user_id))

    # Register blueprints
    from app.controllers.public import public_bp
    from app.controllers.auth import auth_bp
    from app.controllers.admin import admin_bp
    from app.controllers.laporan import laporan_bp
    from app.controllers.sensor import sensor_bp

    app.register_blueprint(public_bp)
    app.register_blueprint(auth_bp, url_prefix="/admin")
    app.register_blueprint(admin_bp, url_prefix="/admin")
    app.register_blueprint(laporan_bp, url_prefix="/laporan")
    app.register_blueprint(sensor_bp, url_prefix="/api/sensor")

    # CSRF dikecualikan untuk endpoint sensor (pakai API Key)
    csrf.exempt(sensor_bp)

    # Error handlers
    @app.errorhandler(404)
    def not_found(e):
        return render_template("errors/404.html"), 404

    @app.errorhandler(413)
    def too_large(e):
        from flask import flash, redirect, request
        flash(f"Ukuran file melebihi batas {app.config['MAX_UPLOAD_MB']}MB.", "error")
        return redirect(request.referrer or "/")

    @app.errorhandler(500)
    def server_error(e):
        return render_template("errors/500.html"), 500

    # Jinja filter — strftime cross-platform + nama bulan Bahasa Indonesia.
    # %-d / %-m tidak jalan di Windows, dan strftime %b/%B tergantung locale OS,
    # jadi kita render token sendiri dengan mapping tetap ke Bahasa Indonesia.
    BULAN_PANJANG = [
        "", "Januari", "Februari", "Maret", "April", "Mei", "Juni",
        "Juli", "Agustus", "September", "Oktober", "November", "Desember",
    ]
    BULAN_SINGKAT = [
        "", "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
        "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
    ]

    @app.template_filter("tgl")
    def _tgl_filter(value, fmt="%d %b %Y"):
        if value is None:
            return ""
        token_map = {
            "%-d": str(value.day),
            "%-m": str(value.month),
            "%d": f"{value.day:02d}",
            "%m": f"{value.month:02d}",
            "%Y": str(value.year),
            "%y": f"{value.year % 100:02d}",
            "%H": f"{value.hour:02d}",
            "%M": f"{value.minute:02d}",
            "%S": f"{value.second:02d}",
            "%b": BULAN_SINGKAT[value.month],
            "%B": BULAN_PANJANG[value.month],
        }
        out = fmt
        # Urutan: token yang lebih panjang dulu (%-d sebelum %d)
        for k in sorted(token_map.keys(), key=len, reverse=True):
            out = out.replace(k, token_map[k])
        return out

    @app.context_processor
    def inject_globals():
        from app.services.status_desa import hitung_status_desa
        try:
            status = hitung_status_desa()
        except Exception:
            status = {"label": "AMAN", "warna": "green", "deskripsi": "Sistem normal."}
        return {"status_desa": status}

    @app.cli.command("init-db")
    def init_db_command():
        """Buat semua tabel di database."""
        db.create_all()
        print("Database initialized.")

    return app