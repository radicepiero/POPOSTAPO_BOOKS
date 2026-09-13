import re
from collections import defaultdict
from PIL import Image, ImageEnhance, ImageFilter
import pytesseract
from pathlib import Path
from ..config import settings


if settings.tesseract_cmd:
    pytesseract.pytesseract.tesseract_cmd = settings.tesseract_cmd


def _preprocess_image(image: Image.Image) -> Image.Image:
    # Convert to grayscale
    img = image.convert("L")
    # Auto contrast stretch
    from PIL import ImageOps
    img = ImageOps.autocontrast(img)
    # Upscale if too small (Tesseract works better on larger text)
    width, height = img.size
    min_dimension = 1500
    if max(width, height) < min_dimension:
        scale = min_dimension / max(width, height)
        new_size = (int(width * scale), int(height * scale))
        img = img.resize(new_size, Image.LANCZOS)
    # Mild sharpening
    img = img.filter(ImageFilter.SHARPEN)
    return img


def _normalize_isbn(isbn: str) -> str:
    return isbn.replace("-", "").replace(" ", "").replace(".", "")


def extract_isbn(text: str) -> str | None:
    # Match ISBN-13 starting with 978 or 979, or a legacy 10-digit ISBN
    for match in re.finditer(r"(?:ISBN[- ]?)?(97[89]\d{10}|\d{9}[\dX])", text, re.IGNORECASE):
        candidate = _normalize_isbn(match.group(1))
        if len(candidate) in (10, 13):
            return candidate
    return None


def extract_year(text: str) -> int | None:
    match = re.search(r"\b(19|20)\d{2}\b", text)
    return int(match.group(0)) if match else None


def _clean_text(text: str) -> str:
    # Remove stray symbols and keep readable characters
    text = re.sub(r"[^\w\s\-]", "", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def _extract_lines(image: Image.Image) -> list[dict]:
    data = pytesseract.image_to_data(image, output_type=pytesseract.Output.DICT)
    lines: dict[tuple, dict] = {}
    for i in range(len(data["text"])):
        conf = int(data["conf"][i])
        text = data["text"][i].strip()
        if not text or conf < 20:
            continue
        key = (data["block_num"][i], data["par_num"][i], data["line_num"][i])
        if key not in lines:
            lines[key] = {
                "text": text,
                "top": data["top"][i],
                "left": data["left"][i],
                "heights": [data["height"][i]],
                "confidences": [conf],
            }
        else:
            lines[key]["text"] += " " + text
            lines[key]["heights"].append(data["height"][i])
            lines[key]["confidences"].append(conf)

    result = []
    for key, value in lines.items():
        avg_height = sum(value["heights"]) / len(value["heights"])
        avg_conf = sum(value["confidences"]) / len(value["confidences"])
        cleaned = _clean_text(value["text"])
        if len(cleaned) < 2:
            continue
        result.append({
            "text": cleaned,
            "top": value["top"],
            "avg_height": avg_height,
            "avg_conf": avg_conf,
        })
    return result


def ocr_image(image_path: str) -> str:
    path = Path(image_path)
    if not path.is_absolute():
        path = Path(__file__).resolve().parent.parent / image_path.lstrip("/")
    img = Image.open(path)
    img = _preprocess_image(img)
    return pytesseract.image_to_string(img, config="--psm 6")


def extract_metadata_from_image(image_path: str) -> dict:
    path = Path(image_path)
    if not path.is_absolute():
        path = Path(__file__).resolve().parent.parent / image_path.lstrip("/")

    try:
        img = Image.open(path)
        img = _preprocess_image(img)
    except Exception as exc:
        return {"text": "", "error": str(exc)}

    # Get plain text for debugging/extracting ISBN/year
    text = pytesseract.image_to_string(img, config="--psm 6")
    isbn = extract_isbn(text)
    year = extract_year(text)

    # Get structured lines
    lines = _extract_lines(img)
    # Sort by vertical position (top to bottom)
    lines.sort(key=lambda x: x["top"])
    # Filter out very small text (likely fine print)
    prominent = [line for line in lines if line["avg_height"] >= 15 and len(line["text"]) > 2]

    title = None
    if prominent:
        # For book covers, author is usually above the title. Use the top 2 prominent lines.
        title = " ".join(line["text"] for line in prominent[:3])
    elif lines:
        title = " ".join(line["text"] for line in lines[:3])

    return {
        "text": text,
        "isbn": isbn,
        "year": year,
        "title": title,
    }
