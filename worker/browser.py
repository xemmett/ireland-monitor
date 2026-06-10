import asyncio
import logging
import os
from typing import AsyncGenerator
from contextlib import asynccontextmanager

logger = logging.getLogger(__name__)

CDP_URL = os.getenv("CDP_URL", "http://cloak:9222")


class CloakPage:
    """Context manager that owns a single browser page and cleans up reliably."""

    def __init__(
        self,
        seed: int,
        timezone: str = "Europe/London",
        locale: str = "en-GB",
        cookies: list[dict] | None = None,
    ):
        self.seed = seed
        self.timezone = timezone
        self.locale = locale
        self.cookies = cookies
        self._pw = None
        self._browser = None
        self._ctx = None
        self.page = None

    async def __aenter__(self):
        from playwright.async_api import async_playwright

        self._pw = await async_playwright().start()
        try:
            url = (
                f"{CDP_URL}?fingerprint={self.seed}"
                f"&timezone={self.timezone}&locale={self.locale}&platform=windows"
            )
            self._browser = await self._pw.chromium.connect_over_cdp(url)
            self._ctx = await self._browser.new_context(locale=self.locale)
            if self.cookies:
                await self._ctx.add_cookies(self.cookies)
            self.page = await self._ctx.new_page()
        except Exception:
            await self._pw.stop()
            raise
        return self.page

    async def __aexit__(self, *_):
        try:
            if self._ctx:
                await self._ctx.close()
        except Exception:
            pass
        try:
            if self._browser:
                await self._browser.close()
        except Exception:
            pass
        try:
            if self._pw:
                await self._pw.stop()
        except Exception:
            pass


def cloak_page(
    seed: int,
    timezone: str = "Europe/London",
    locale: str = "en-GB",
    cookies: list[dict] | None = None,
) -> CloakPage:
    return CloakPage(seed=seed, timezone=timezone, locale=locale, cookies=cookies)
