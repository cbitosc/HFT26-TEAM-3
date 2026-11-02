import io

import pytest

from app.services.filetypes import check_kind, sniff
from app.storage import UploadTooLarge, commit_staged, derived_dir, safe_resolve, sanitize_filename, stage_upload

MP4_HEAD = b"\x00\x00\x00\x18ftypmp42" + b"\x00" * 20


def test_sanitize_filename_removes_paths_and_specials():
    assert sanitize_filename("../../etc/passwd") == "passwd"
    assert sanitize_filename("C:\\Users\\me\\clip 01.mp4") == "clip 01.mp4"
    assert sanitize_filename("a<b>|c?.txt") == "a_b_c_.txt"
    assert sanitize_filename("..") == "upload"
    assert sanitize_filename(None) == "upload"
    assert len(sanitize_filename("x" * 500 + ".mp4")) <= 120
    assert sanitize_filename("évidence.txt").endswith(".txt")


def test_safe_resolve_blocks_escape(tmp_path):
    (tmp_path / "originals").mkdir()
    assert safe_resolve(tmp_path, "originals/ab/abcd") == (tmp_path / "originals/ab/abcd").resolve()
    for bad in ("../outside", "originals/../../outside", "/etc/passwd"):
        with pytest.raises(ValueError):
            safe_resolve(tmp_path, bad)


def test_derived_dir_rejects_unsafe_ids(tmp_path):
    assert derived_dir(tmp_path, "case_1", "ev_1", "run_1").is_dir()
    with pytest.raises(ValueError):
        derived_dir(tmp_path, "../x", "ev_1", "run_1")


def test_stage_upload_limit_leaves_no_residue(tmp_path):
    with pytest.raises(UploadTooLarge):
        stage_upload(io.BytesIO(b"x" * 2048), tmp_path, max_bytes=1024)
    assert list((tmp_path / "tmp").iterdir()) == []


def test_commit_is_content_addressed_readonly_and_idempotent(tmp_path):
    a = stage_upload(io.BytesIO(b"hello"), tmp_path, 1024)
    rel = commit_staged(a, tmp_path)
    assert rel == f"originals/{a.sha256[:2]}/{a.sha256}"
    assert (tmp_path / rel).stat().st_mode & 0o222 == 0  # no write bits
    b = stage_upload(io.BytesIO(b"hello"), tmp_path, 1024)
    assert commit_staged(b, tmp_path) == rel
    assert list((tmp_path / "tmp").iterdir()) == []


@pytest.mark.parametrize("head,category", [
    (MP4_HEAD, "video"), (b"RIFF\x00\x00\x00\x00AVI LIST", "video"), (b"\x1a\x45\xdf\xa3rest", "video"),
    (b"%PDF-1.7\n", "pdf"), (b"a,b\n1,2\n", "text"), (b"\xff\xfe\x00\x00binary", "binary"), (b"\x89PNG\r\n\x1a\n\x00", "binary"),
    ("héllo wörld".encode(), "text"),
])
def test_sniff_by_content(head, category):
    assert sniff(head).category == category


def test_sniff_tolerates_cut_multibyte_tail():
    assert sniff("é".encode()[:1]).category == "text"


def test_kind_compatibility():
    assert check_kind("dashcam", sniff(MP4_HEAD), MP4_HEAD) is None
    assert check_kind("dashcam", sniff(b"a,b\n1,2\n"), b"a,b\n1,2\n") is not None
    assert check_kind("sensor_csv", sniff(b"just prose here\n"), b"just prose here\n") is not None
    assert check_kind("sensor_csv", sniff(b"t;speed\n0;1\n"), b"t;speed\n0;1\n") is None
    assert check_kind("witness_pdf", sniff(b"%PDF-1.4"), b"%PDF-1.4") is None
    assert check_kind("witness_text", sniff(b"%PDF-1.4"), b"%PDF-1.4") is not None
