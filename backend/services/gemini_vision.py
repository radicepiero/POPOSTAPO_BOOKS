"""Gemini Vision service for book cover analysis."""

import base64
import json
import logging
from pathlib import Path
from typing import Optional

from google import genai

from ..config import settings

logger = logging.getLogger(__name__)

COVER_PROMPT = """Analyze this book cover image and extract the following metadata.
Return ONLY a valid JSON object with these fields (use null for missing values):

{
  "title": "book title",
  "subtitle": "subtitle if visible",
  "authors": ["author1", "author2"],
  "publisher": "publisher name",
  "isbn": "ISBN if visible (13 or 10 digits)",
  "year": 2024,
  "language": "ISO 639-3 code (e.g. ita, eng, fra, deu, spa)",
  "series": "series/collection name if visible",
  "pages": null
}

Rules:
- Extract only what is clearly visible on the cover
- For authors, use the format shown on the cover
- If you see an ISBN barcode, extract the number
- Detect the language from the text on the cover
- Do not invent or guess information not visible in the image
- Return ONLY the JSON, no markdown, no explanation"""


def analyze_cover(image_path: str) -> dict:
    """Analyze a book cover image using Gemini Vision API.

    Returns a dict with extracted metadata, or an error dict.
    """
    if not settings.gemini_api_key:
        return {"error": "Gemini API key not configured"}

    path = Path(image_path)
    if not path.is_absolute():
        path = Path(__file__).resolve().parent.parent / image_path.lstrip("/")

    if not path.exists():
        return {"error": f"Image not found: {path}"}

    try:
        image_bytes = path.read_bytes()

        # Detect mime type
        suffix = path.suffix.lower()
        mime_map = {
            ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
            ".png": "image/png", ".webp": "image/webp",
            ".heic": "image/heic", ".heif": "image/heif",
        }
        mime_type = mime_map.get(suffix, "image/jpeg")

        client = genai.Client(api_key=settings.gemini_api_key)

        response = client.models.generate_content(
            model="gemini-3.6-flash",
            contents=[
                genai.types.Content(
                    parts=[
                        genai.types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
                        genai.types.Part.from_text(text=COVER_PROMPT),
                    ]
                )
            ],
        )

        raw_text = response.text.strip()
        # Strip markdown code fences if present
        if raw_text.startswith("```"):
            raw_text = raw_text.split("\n", 1)[1] if "\n" in raw_text else raw_text[3:]
            if raw_text.endswith("```"):
                raw_text = raw_text[:-3].strip()

        metadata = json.loads(raw_text)

        # Normalize
        if isinstance(metadata.get("authors"), str):
            metadata["authors"] = [metadata["authors"]]
        if isinstance(metadata.get("year"), str):
            try:
                metadata["year"] = int(metadata["year"])
            except ValueError:
                metadata["year"] = None

        return {"success": True, **metadata}

    except json.JSONDecodeError as exc:
        logger.error("Gemini returned invalid JSON: %s", raw_text[:200])
        return {"error": f"Invalid JSON from Gemini: {exc}", "raw": raw_text}
    except Exception as exc:
        logger.error("Gemini Vision error: %s", exc)
        return {"error": str(exc)}
