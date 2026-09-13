"""OpenAI Vision service for book cover analysis."""

import base64
import json
import logging
from pathlib import Path

from openai import OpenAI

from ..config import settings

logger = logging.getLogger(__name__)

COVER_PROMPT = """Analyze this book cover image and extract only metadata clearly visible on it.
Return a JSON object with exactly these fields, using null for missing scalar values:
{
  "title": "book title",
  "subtitle": "subtitle if visible",
  "authors": ["author1", "author2"],
  "contributors": [{"name": "person name", "role": "author, translator, editor, illustrator, or other"}],
  "original_title": "original title if explicitly printed",
  "publisher": "publisher name",
  "isbn": "ISBN if visible, normalized to 10 or 13 characters",
  "year": 2024,
  "language": "ISO 639-3 code",
  "series": "series or collection name if visible",
  "pages": null
}
Do not infer bibliographic facts that are not visible. Return only JSON."""


def analyze_cover(image_paths: dict[str, str]) -> dict:
    if not settings.openai_api_key:
        return {"error": "OpenAI API key not configured"}

    content = [{"type": "text", "text": COVER_PROMPT}]
    for role, image_path in image_paths.items():
        path = Path(image_path)
        if not path.is_absolute():
            path = Path(__file__).resolve().parent.parent / image_path.lstrip("/")
        if not path.exists():
            return {"error": f"Image not found: {path}"}
        mime_type = {
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".png": "image/png",
            ".webp": "image/webp",
        }.get(path.suffix.lower(), "image/jpeg")
        data_url = f"data:{mime_type};base64,{base64.b64encode(path.read_bytes()).decode('ascii')}"
        content.extend([
            {"type": "text", "text": f"Image role: {role}"},
            {"type": "image_url", "image_url": {"url": data_url, "detail": "high"}},
        ])

    try:
        response = OpenAI(api_key=settings.openai_api_key).chat.completions.create(
            model=settings.openai_vision_model,
            messages=[{"role": "user", "content": content}],
            response_format={"type": "json_object"},
            temperature=0,
        )
        raw_text = response.choices[0].message.content or "{}"
        metadata = json.loads(raw_text)
        if isinstance(metadata.get("authors"), str):
            metadata["authors"] = [metadata["authors"]]
        if isinstance(metadata.get("year"), str):
            try:
                metadata["year"] = int(metadata["year"])
            except ValueError:
                metadata["year"] = None
        return {"success": True, **metadata}
    except json.JSONDecodeError as exc:
        logger.error("OpenAI returned invalid JSON: %s", raw_text[:200])
        return {"error": f"Invalid JSON from OpenAI: {exc}"}
    except Exception as exc:
        logger.error("OpenAI Vision error: %s", exc)
        return {"error": str(exc)}
