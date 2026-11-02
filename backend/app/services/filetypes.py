"""Content-based file type detection. The client's filename and Content-Type are never trusted."""
import codecs
from dataclasses import dataclass


@dataclass(frozen=True)
class Sniffed:
    category: str  # video | pdf | text | binary
    mime: str


# evidence kind -> categories it may contain
ALLOWED: dict[str, set[str]] = {
    "dashcam": {"video"},
    "cctv": {"video"},
    "other": {"video"},
    "witness_text": {"text"},
    "witness_pdf": {"pdf"},
    "sensor_csv": {"text"},
    "annotation": {"text"},
    "ground_truth": {"text"},
}
VIDEO_KINDS = {"dashcam", "cctv"}


def sniff(head: bytes) -> Sniffed:
    if len(head) >= 12 and head[4:8] == b"ftyp":
        return Sniffed("video", "video/quicktime" if head[8:12] == b"qt  " else "video/mp4")
    if head[:4] == b"RIFF" and head[8:12] == b"AVI ":
        return Sniffed("video", "video/x-msvideo")
    if head[:4] == b"\x1a\x45\xdf\xa3":
        return Sniffed("video", "video/x-matroska")
    if head[:5] == b"%PDF-":
        return Sniffed("pdf", "application/pdf")
    if head and b"\x00" not in head:
        try:
            codecs.getincrementaldecoder("utf-8-sig")().decode(head, final=False)  # tolerate a cut multibyte tail
            return Sniffed("text", "text/plain")
        except UnicodeDecodeError:
            pass
    return Sniffed("binary", "application/octet-stream")


def has_delimiter(head: bytes) -> bool:
    first = head.decode("utf-8-sig", errors="ignore").splitlines()[0] if head.strip() else ""
    return any(d in first for d in (",", ";", "\t"))


def check_kind(kind: str, sniffed: Sniffed, head: bytes) -> str | None:
    """Return None if the content fits the declared kind, otherwise a human-readable reason."""
    if sniffed.category not in ALLOWED[kind]:
        return f"content looks like {sniffed.category} ({sniffed.mime}), which is not valid for kind '{kind}'"
    if kind == "sensor_csv" and not has_delimiter(head):
        return "sensor_csv must be delimited text with a header row (comma, semicolon or tab)"
    return None


def final_mime(kind: str, sniffed: Sniffed) -> str:
    return "text/csv" if kind == "sensor_csv" else sniffed.mime
