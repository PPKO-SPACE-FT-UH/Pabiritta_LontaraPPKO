"""i18n helper untuk Pa'Biritta."""
import json
import os

from flask import g, request, url_for as _flask_url_for, redirect

SUPPORTED_LANGS = ("id", "en")
DEFAULT_LANG = "id"
EN_PREFIX = "/en"

# Prefix URL yang selalu dipaksa Bahasa Indonesia (tidak ada versi EN).
# Kalau user akses /en/admin/... → di-redirect 301 ke /admin/...
ID_ONLY_PATH_PREFIXES = ("/admin",)

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


def _is_id_only_path(path: str) -> bool:
    return any(path.startswith(p) for p in ID_ONLY_PATH_PREFIXES)


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
    """Wrapper `url_for` yang menambahkan prefix `/en` bila perlu.

    Skip untuk URL yang tidak boleh diterjemahkan (mis. `/admin/*`) — link ke
    halaman admin selalu tanpa prefix `/en`, apapun bahasa aktif.
    """
    url = _flask_url_for(endpoint, **values)
    if get_lang() != "en":
        return url
    if not url.startswith("/"):
        return url
    if url == EN_PREFIX or url.startswith(EN_PREFIX + "/"):
        return url
    if _is_id_only_path(url):
        return url
    return EN_PREFIX + url


def switch_lang_url(target_lang: str) -> str:
    if target_lang not in SUPPORTED_LANGS:
        target_lang = DEFAULT_LANG
    path = request.path or "/"
    query = request.query_string.decode("utf-8") if request.query_string else ""
    suffix = f"?{query}" if query else ""
    # Path admin selalu Bahasa Indonesia, jadi switcher balik ke non-/en
    if _is_id_only_path(path):
        return path + suffix
    if target_lang == "en":
        return EN_PREFIX + path + suffix
    return path + suffix


def canonical_url(site_url: str) -> str:
    site_url = (site_url or "").rstrip("/")
    path = request.path or "/"
    if get_lang() == "en" and not _is_id_only_path(path):
        return f"{site_url}{EN_PREFIX}{path}"
    return f"{site_url}{path}"


def alternate_url(site_url: str, target_lang: str) -> str:
    site_url = (site_url or "").rstrip("/")
    path = request.path or "/"
    if _is_id_only_path(path):
        return f"{site_url}{path}"
    if target_lang == "en":
        return f"{site_url}{EN_PREFIX}{path}"
    return f"{site_url}{path}"


def url_prefix_for_current_lang() -> str:
    """Returns '/en' bila lang aktif = EN, else ''. Dipakai JS untuk build URL."""
    return EN_PREFIX if get_lang() == "en" else ""


def init_app(app) -> None:
    app.wsgi_app = LanguageMiddleware(app.wsgi_app)

    @app.before_request
    def _set_lang():
        g.lang = request.environ.get("pabiritta.lang", DEFAULT_LANG)

    @app.before_request
    def _force_id_for_admin():
        """Kalau user akses /en/admin/... → redirect 301 ke /admin/... 
        supaya URL admin selalu canonical tanpa prefix bahasa."""
        if get_lang() == "en" and _is_id_only_path(request.path):
            query = request.query_string.decode("utf-8") if request.query_string else ""
            target = request.path + (f"?{query}" if query else "")
            return redirect(target, code=301)
        # Safety net: paksa lang=id di semua path admin
        if _is_id_only_path(request.path):
            g.lang = DEFAULT_LANG

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
            "url_prefix": url_prefix_for_current_lang(),
        }