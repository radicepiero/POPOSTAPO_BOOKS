from io import BytesIO

from PIL import Image, ImageEnhance, ImageFilter, ImageOps, UnidentifiedImageError
import zxingcpp


MAX_IMAGE_BYTES = 10 * 1024 * 1024


def _is_valid_isbn13(value: str) -> bool:
    if len(value) != 13 or not value.isdigit() or not value.startswith(("978", "979")):
        return False
    checksum = sum((1 if index % 2 == 0 else 3) * int(digit) for index, digit in enumerate(value[:12]))
    return (10 - checksum % 10) % 10 == int(value[-1])


def _image_variants(image: Image.Image) -> list[Image.Image]:
    image = ImageOps.exif_transpose(image).convert("RGB")
    width, height = image.size
    crops = [
        image,
        image.crop((width * 0.05, height * 0.2, width * 0.95, height * 0.8)),
        image.crop((width * 0.05, height * 0.3, width * 0.95, height * 0.7)),
    ]
    variants: list[Image.Image] = []
    for crop in crops:
        gray = ImageOps.autocontrast(crop.convert("L"))
        if gray.width < 1200:
            scale = min(2.5, 1200 / gray.width)
            gray = gray.resize((round(gray.width * scale), round(gray.height * scale)), Image.Resampling.LANCZOS)
        contrasted = ImageEnhance.Contrast(gray).enhance(2)
        variants.extend([
            crop,
            gray,
            contrasted,
            contrasted.filter(ImageFilter.SHARPEN),
            contrasted.point(lambda pixel: 255 if pixel > 128 else 0),
        ])
    return variants


def decode_barcode_image(content: bytes) -> list[dict[str, str]]:
    if not content:
        raise ValueError("Immagine vuota")
    if len(content) > MAX_IMAGE_BYTES:
        raise ValueError("Immagine troppo grande: massimo 10 MB")
    try:
        image = Image.open(BytesIO(content))
        image.load()
    except (UnidentifiedImageError, OSError) as exc:
        raise ValueError("File immagine non valido") from exc

    if image.width * image.height > 20_000_000:
        raise ValueError("Immagine troppo grande: massimo 20 megapixel")

    decoded: dict[tuple[str, str], dict[str, str]] = {}
    binarizers = [
        zxingcpp.Binarizer.LocalAverage,
        zxingcpp.Binarizer.GlobalHistogram,
        zxingcpp.Binarizer.FixedThreshold,
    ]
    for variant in _image_variants(image):
        for binarizer in binarizers:
            results = zxingcpp.read_barcodes(
                variant,
                formats=zxingcpp.BarcodeFormat.AllRetail,
                try_rotate=True,
                try_downscale=True,
                try_invert=True,
                binarizer=binarizer,
            )
            for result in results:
                text = result.text.strip()
                digits = "".join(character for character in text if character.isdigit())
                value = digits if _is_valid_isbn13(digits) else text
                key = (value, str(result.format))
                decoded[key] = {"value": value, "format": str(result.format)}
            if any(_is_valid_isbn13(item["value"]) for item in decoded.values()):
                break
        if any(_is_valid_isbn13(item["value"]) for item in decoded.values()):
            break

    return sorted(decoded.values(), key=lambda item: not _is_valid_isbn13(item["value"]))
