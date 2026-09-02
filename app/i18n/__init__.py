"""i18n helper untuk Pa'Biritta.

Alur singkat:
- WSGI middleware mendeteksi prefix URL `/en/...` dan menandai request sebagai
  Bahasa Inggris. Selain itu, request dianggap Bahasa Indonesia (default).
- `t(key, **fmt)` mengambil terjemahan dengan dot-notation key
  (mis. `t('nav.home')`). Jika tidak ada, fallback ke Bahasa Indonesia.
- `localized_url_for(endpoint, **values)` mengembalikan URL yang diberi
  prefix `/en` bila bahasa aktif adalah EN. Fungsi ini di-expose sebagai
  `url_for` di Jinja, jadi template lama tetap jalan tanpa perlu diubah.
"""
import json
import os

from flask import g, request, url_for as _flask_url_for

SUPPORTED_LANGS = ("id", "en")
DEFAULT_LANG = "id"
EN_PREFIX = "/en"

_translations: dict[str, dict] = {}


def _load_translations() -> None:
    base_dir = os.path.dirname(os.path.abspath(__file__))
    for lang in SUPPORTED_LANGS:
        path = os.path.join(base_dir, f"{lang}.json")
        try:
            with open(path, "r", encoding="utf-8") as f:
                _translations[lang] = json.load(f)
        except FileNotFoundError:
            _translations[lang] = {}


_load_translations()


class LanguageMiddleware:
    """Rewrite `/en/...` -> `/...` dan simpan bahasa di environ.

    URL routing Flask berjalan pada path yang sudah di-rewrite, jadi kita
    tidak perlu duplikasi setiap route untuk versi EN.
    """

    def __init__(self, wsgi_app):
        self.wsgi_app = wsgi_app

    def __call__(self, environ, start_response):
        path = environ.get("PATH_INFO", "") or "/"
        if path == EN_PREFIX or path.startswith(EN_PREFIX + "/"):
            environ["pabiritta.lang"] = "en"
            environ["PATH_INFO"] = path[len(EN_PREFIX):] or "/"
        else:
            environ["pabiritta.lang"] = "id"
        return self.wsgi_app(environ, start_response)


def get_lang() -> str:
    lang = getattr(g, "lang", None)
    if lang in SUPPORTED_LANGS:
        return lang
    return DEFAULT_LANG


def t(key: str, **fmt) -> str:
    """Ambil terjemahan berdasarkan `key` (dot-notation).

    Fallback: bahasa aktif -> Bahasa Indonesia -> raw key.
    Kwargs digunakan untuk `str.format` interpolation.
    """
    lang = get_lang()

    def _lookup(source):
        node = source
        for part in key.split("."):
            if isinstance(node, dict) and part in node:
                node = node[part]
            else:
                return None
        return node if isinstance(node, str) else None

    value = _lookup(_translations.get(lang, {}))
    if value is None and lang != DEFAULT_LANG:
        value = _lookup(_translations.get(DEFAULT_LANG, {}))
    if value is None:
        return key

    if fmt:
        try:
            return value.format(**fmt)
        except (KeyError, IndexError):
            return value
    return value


def localized_url_for(endpoint: str, **values) -> str:
    """Wrapper `url_for` yang menambahkan prefix `/en` bila perlu."""
    url = _flask_url_for(endpoint, **values)
    if get_lang() == "en" and url.startswith("/") and not (
        url == EN_PREFIX or url.startswith(EN_PREFIX + "/")
    ):
        return EN_PREFIX + url
    return url


def switch_lang_url(target_lang: str) -> str:
    """URL versi bahasa lain dari halaman yang sedang dilihat."""
    if target_lang not in SUPPORTED_LANGS:
        target_lang = DEFAULT_LANG
    path = request.path or "/"
    query = request.query_string.decode("utf-8") if request.query_string else ""
    suffix = f"?{query}" if query else ""
    if target_lang == "en":
        return EN_PREFIX + path + suffix
    return path + suffix


def init_app(app) -> None:
    app.wsgi_app = LanguageMiddleware(app.wsgi_app)

    @app.before_request
    def _set_lang():
        g.lang = request.environ.get("pabiritta.lang", DEFAULT_LANG)

    @app.context_processor
    def _inject_i18n():
        return {
            "t": t,
            "current_lang": get_lang(),
            "supported_langs": SUPPORTED_LANGS,
            "switch_lang_url": switch_lang_url,
            "url_for": localized_url_for,
        }