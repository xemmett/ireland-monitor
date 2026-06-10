import logging

logger = logging.getLogger(__name__)


def load_netscape_cookies(path: str) -> list[dict]:
    """Parse a Netscape/Mozilla cookie-jar file into Playwright cookie dicts."""
    cookies: list[dict] = []
    try:
        with open(path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                fields = line.split("\t")
                if len(fields) != 7:
                    continue
                domain, _flag, cookie_path, secure, expiry, name, value = fields
                cookies.append({
                    "name": name,
                    "value": value,
                    "domain": domain,
                    "path": cookie_path,
                    "expires": float(expiry) if expiry != "0" else -1,
                    "secure": secure.upper() == "TRUE",
                })
        logger.info("Loaded %d cookies from %s", len(cookies), path)
    except FileNotFoundError:
        logger.info("Cookie file not found: %s (continuing without cookies)", path)
    except Exception as e:
        logger.warning("Failed to load cookies from %s: %s", path, e)
    return cookies
