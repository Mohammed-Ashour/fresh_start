#!/usr/bin/env python3
"""Validate the structure and offline constraints of a Skipper lesson HTML file."""

from __future__ import annotations

import argparse
import logging
import re
import sys
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse

REQUIRED_SECTION_IDS = (
    "focus-outcome",
    "why-it-matters",
    "mental-model",
    "recognize",
    "smallest-safe-fix",
    "verify",
    "apply-nearby",
    "practice",
    "common-mistakes",
    "reference-card",
    "resources",
)

FORBIDDEN_EMBED_TAGS = {"iframe", "object", "embed"}
MEDIA_TAGS = {"img", "audio", "video", "source", "track"}

logger = logging.getLogger(__name__)


class LessonParser(HTMLParser):
    """Collect lesson structure and offline-policy violations from HTML."""

    def __init__(self) -> None:
        """Initialize parser state for one lesson document."""
        super().__init__(convert_charrefs=True)
        self.section_ids: list[str] = []
        self.h1_count = 0
        self.has_inline_style = False
        self.has_inline_svg = False
        self.has_mermaid = False
        self.errors: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        """Track tags and attributes needed for validation.

        Args:
            tag: HTML tag name.
            attrs: Tag attributes as parsed by ``HTMLParser``.
        """
        attr_map = {key.lower(): (value or "") for key, value in attrs}
        tag = tag.lower()

        if tag == "section" and attr_map.get("id"):
            self.section_ids.append(attr_map["id"])
        elif tag == "h1":
            self.h1_count += 1
        elif tag == "style":
            self.has_inline_style = True
        elif tag == "svg":
            self.has_inline_svg = True

        class_names = set(attr_map.get("class", "").split())
        if "mermaid" in class_names:
            self.has_mermaid = True

        if tag == "link" and "stylesheet" in attr_map.get("rel", "").lower().split():
            self.errors.append("linked stylesheets are not allowed; use inline <style>")

        if tag == "script" and attr_map.get("src"):
            self.errors.append("external JavaScript is not allowed")

        if tag in FORBIDDEN_EMBED_TAGS:
            self.errors.append(f"<{tag}> is not allowed in an offline lesson")

        if tag in MEDIA_TAGS:
            source = attr_map.get("src", "")
            if source and not source.startswith("data:"):
                self.errors.append(f"<{tag}> must not load an external or local asset: {source}")
            if attr_map.get("srcset"):
                self.errors.append(f"<{tag}> must not use srcset; use one inline data: source")

        style_value = attr_map.get("style", "")
        if contains_remote_css_url(style_value):
            self.errors.append("inline style contains a remote CSS url() reference")


def contains_remote_css_url(css_text: str) -> bool:
    """Return whether a CSS snippet references a remote URL.

    Args:
        css_text: CSS text to inspect.

    Returns:
        True when the CSS contains an ``http``, ``https``, or protocol-relative
        ``url()`` reference.
    """
    for match in re.finditer(r"url\(\s*['\"]?([^)'\"]+)", css_text, flags=re.IGNORECASE):
        target = match.group(1).strip()
        parsed = urlparse(target)
        if parsed.scheme in {"http", "https"} or target.startswith("//"):
            return True
    return False


def has_document_title(html_text: str) -> bool:
    """Return whether the HTML document has a title in its head element.

    Args:
        html_text: Full lesson HTML document.

    Returns:
        True when a ``<title>`` element appears inside ``<head>``.
    """
    head_match = re.search(r"<head\b[^>]*>(.*?)</head\s*>", html_text, flags=re.IGNORECASE | re.DOTALL)
    return head_match is not None and re.search(r"<title\b[^>]*>", head_match.group(1), flags=re.IGNORECASE) is not None


def validate(path: Path) -> list[str]:
    """Validate one lesson HTML file against the Skipper lesson standard.

    Args:
        path: Lesson HTML path.

    Returns:
        A list of validation errors. The list is empty when validation passes.
    """
    errors: list[str] = []

    if not path.is_file():
        return [f"file does not exist: {path}"]

    text = path.read_text(encoding="utf-8")
    parser = LessonParser()
    try:
        parser.feed(text)
        parser.close()
    except Exception as exc:  # HTMLParser errors are unusual but should be reported clearly.
        return [f"could not parse HTML: {exc}"]

    errors.extend(parser.errors)

    if not re.search(r"<!doctype\s+html", text, flags=re.IGNORECASE):
        errors.append("missing <!doctype html>")
    if not has_document_title(text):
        errors.append("missing <head><title>")
    if parser.h1_count != 1:
        errors.append(f"expected exactly one <h1>, found {parser.h1_count}")
    if not parser.has_inline_style:
        errors.append("missing inline <style>")
    if parser.has_mermaid:
        errors.append("Mermaid runtime blocks are not allowed; render diagrams as inline SVG")

    missing_sections = [section_id for section_id in REQUIRED_SECTION_IDS if section_id not in parser.section_ids]
    if missing_sections:
        errors.append("missing required section IDs: " + ", ".join(missing_sections))

    duplicates = sorted({section_id for section_id in parser.section_ids if parser.section_ids.count(section_id) > 1})
    if duplicates:
        errors.append("duplicate section IDs: " + ", ".join(duplicates))

    style_blocks = re.findall(r"<style\b[^>]*>(.*?)</style>", text, flags=re.IGNORECASE | re.DOTALL)
    if any(contains_remote_css_url(block) for block in style_blocks):
        errors.append("CSS contains a remote url() reference")

    if re.search(r"@import\s+(?:url\()?\s*['\"]?(?:https?:)?//", text, flags=re.IGNORECASE):
        errors.append("remote CSS @import is not allowed")

    return errors


def main() -> int:
    """Run the lesson validator CLI.

    Returns:
        Process exit code.
    """
    logging.basicConfig(level=logging.INFO, format="%(message)s")

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("lesson", type=Path, help="Path to the lesson HTML file")
    args = parser.parse_args()

    errors = validate(args.lesson)
    if errors:
        logger.error("FAIL: %s", args.lesson)
        for error in errors:
            logger.error("- %s", error)
        return 1

    logger.info("PASS: %s", args.lesson)
    logger.info("- required sections: %s", len(REQUIRED_SECTION_IDS))
    logger.info("- offline runtime dependencies: none detected")
    return 0


if __name__ == "__main__":
    sys.exit(main())
