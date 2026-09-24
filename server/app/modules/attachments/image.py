_MAX_EDGE = 8000


def photo_dimensions(data: bytes, content_type: str) -> tuple[int, int] | None:
    if content_type == "image/jpeg":
        return _jpeg(data)
    if content_type == "image/png":
        return _png(data)
    if content_type == "image/webp":
        return _webp(data)
    return None


def sane_photo(width: int, height: int) -> bool:
    return 1 <= width <= _MAX_EDGE and 1 <= height <= _MAX_EDGE


def _jpeg(data: bytes) -> tuple[int, int] | None:
    if len(data) < 4 or data[0] != 0xFF or data[1] != 0xD8:
        return None
    index = 2
    end = len(data)
    while index + 3 < end:
        if data[index] != 0xFF:
            return None
        while index < end and data[index] == 0xFF:
            index += 1
        if index >= end:
            return None
        marker = data[index]
        index += 1
        if marker in {0xD8, 0xD9} or 0xD0 <= marker <= 0xD7:
            continue
        if marker == 0xDA:
            return None
        if index + 1 >= end:
            return None
        length = int.from_bytes(data[index : index + 2], "big")
        if length < 2 or index + length > end:
            return None
        if 0xC0 <= marker <= 0xCF and marker not in {0xC4, 0xC8, 0xCC}:
            if length < 8:
                return None
            height = int.from_bytes(data[index + 3 : index + 5], "big")
            width = int.from_bytes(data[index + 5 : index + 7], "big")
            return width, height
        index += length
    return None


def _png(data: bytes) -> tuple[int, int] | None:
    if len(data) < 24 or not data.startswith(b"\x89PNG\r\n\x1a\n"):
        return None
    if data[12:16] != b"IHDR":
        return None
    width = int.from_bytes(data[16:20], "big")
    height = int.from_bytes(data[20:24], "big")
    return width, height


def _webp(data: bytes) -> tuple[int, int] | None:
    if len(data) < 30 or data[:4] != b"RIFF" or data[8:12] != b"WEBP":
        return None
    kind = data[12:16]
    if kind == b"VP8X":
        width = 1 + int.from_bytes(data[24:27], "little")
        height = 1 + int.from_bytes(data[27:30], "little")
        return width, height
    if kind == b"VP8 " and len(data) >= 30:
        width = int.from_bytes(data[26:28], "little") & 0x3FFF
        height = int.from_bytes(data[28:30], "little") & 0x3FFF
        return width, height
    if kind == b"VP8L" and len(data) >= 25:
        bits = int.from_bytes(data[21:25], "little")
        width = (bits & 0x3FFF) + 1
        height = ((bits >> 14) & 0x3FFF) + 1
        return width, height
    return None
