"""i18n helper untuk Pa'Biritta."""
import json
import os

from flask import g, request, url_for as _flask_url_for

SUPPORTED_LANGS = ("id", "en")
DEFAULT_LANG = "id"
EN_PREFIX = "/en"

_translations = {}


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


def _get_translations():
    try:
        from flask import current_app
        if current_app and current_app.debug:
            _load_translations()
    except RuntimeError:
        pass
    return _translations


class LanguageMiddleware:
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
    lang = get_lang()
    translations = _get_translations()

    def _lookup(source):
        node = source
        for part in key.split("."):
            if isinstance(node, dict) and part in node:
                node = node[part]
            else:
                return None
        return node if isinstance(node, str) else None

    value = _lookup(translations.get(lang, {}))
    if value is None and lang != DEFAULT_LANG:
        value = _lookup(translations.get(DEFAULT_LANG, {}))
    if value is None:
        return key

    if fmt:
        try:
            return value.format(**fmt)
        except (KeyError, IndexError):
            return value
    return value


def localized_url_for(endpoint: str, **values) -> str:
    url = _flask_url_for(endpoint, **values)
    if get_lang() == "en" and url.startswith("/") and not (
        url == EN_PREFIX or url.startswith(EN_PREFIX + "/")
    ):
        return EN_PREFIX + url
    return url


def switch_lang_url(target_lang: str) -> str:
    if target_lang not in SUPPORTED_LANGS:
        target_lang = DEFAULT_LANG
    path = request.path or "/"
    query = request.query_string.decode("utf-8") if request.query_string else ""
    suffix = f"?{query}" if query else ""
    if target_lang == "en":
        return EN_PREFIX + path + suffix
    return path + suffix


def canonical_url(site_url: str) -> str:
    """URL absolut versi bahasa yang sedang aktif."""
    site_url = (site_url or "").rstrip("/")
    path = request.path or "/"
    if get_lang() == "en":
        return f"{site_url}{EN_PREFIX}{path}"
    return f"{site_url}{path}"


def alternate_url(site_url: str, target_lang: str) -> str:
    """URL absolut versi bahasa `target_lang` untuk halaman saat ini."""
    site_url = (site_url or "").rstrip("/")
    path = request.path or "/"
    if target_lang == "en":
        return f"{site_url}{EN_PREFIX}{path}"
    return f"{site_url}{path}"


def init_app(app) -> None:
    app.wsgi_app = LanguageMiddleware(app.wsgi_app)

    @app.before_request
    def _set_lang():
        g.lang = request.environ.get("pabiritta.lang", DEFAULT_LANG)

    @app.context_processor
    def _inject_i18n():
        from flask import current_app
        site_url = current_app.config.get("SITE_URL", "")
        return {
            "t": t,
            "current_lang": get_lang(),
            "supported_langs": SUPPORTED_LANGS,
            "switch_lang_url": switch_lang_url,
            "url_for": localized_url_for,
            "site_url": site_url,
            "canonical_url": canonical_url(site_url),
            "alternate_url_id": alternate_url(site_url, "id"),
            "alternate_url_en": alternate_url(site_url, "en"),
        }