"""Tests for notebook_helpers."""
from __future__ import annotations

import pytest
from notebook_helpers import read_public_file
from notebook_helpers import _normalize_to_public_url


class TestNormalizeToPublicUrl:
    """Pure function: build /notebooks/<project>/public/filename from path segments."""

    def test_has_public_segment(self) -> None:
        segments = ["notebooks", "local-tiny", "public"]
        assert _normalize_to_public_url(segments, "file.svg") == "/notebooks/local-tiny/public/file.svg"

    def test_no_public_segment_uses_all(self) -> None:
        segments = ["notebooks", "my-project"]
        assert _normalize_to_public_url(segments, "file.svg") == "/notebooks/my-project/public/file.svg"

    def test_trailing_dot_in_segment_stripped(self) -> None:
        segments = ["notebooks", "local-tiny", "public"]
        # base and "." in base[-1] -> base[:-1]
        segments_with_dot = ["notebooks", "local-tiny", "index.html"]
        assert _normalize_to_public_url(segments_with_dot, "x.svg") == "/notebooks/local-tiny/public/x.svg"

    def test_empty_base_yields_public_only(self) -> None:
        segments: list[str] = []
        assert _normalize_to_public_url(segments, "file.svg") == "/public/file.svg"


class TestReadPublicFile:
    """read_public_file with mocked mo and _fetch_url."""

    def test_requires_public_base_url_when_location_none(self) -> None:
        mo = MockMo(location=None)
        with pytest.raises(ValueError, match="public_base_url is required"):
            read_public_file(mo, "file.svg")

    def test_uses_public_base_url_when_location_none(self, monkeypatch: pytest.MonkeyPatch) -> None:
        import notebook_helpers as mod

        def fake_fetch(url: str) -> str:
            assert url == "https://example.com/public/file.svg"
            return "<svg/>"

        monkeypatch.setattr(mod, "_fetch_url", fake_fetch)
        mo = MockMo(location=None)
        result = read_public_file(mo, "file.svg", public_base_url="https://example.com/public")
        assert result == "<svg/>"


class MockMo:
    """Minimal mock for mo.notebook_location()."""

    def __init__(self, location: str | None) -> None:
        self._location = location

    def notebook_location(self) -> str | None:
        return self._location
