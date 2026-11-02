"""Editable source description and the clock edges it contributes. Evidence bytes are not touched."""


def annotation_edges(rows: list[dict]) -> list[dict]:
    """Declared offsets become sync edges at the next scenario build.

    `clock_offset_ms` means time in this source = time in the reference source + offset.
    Equal tracker ids are not an input. A missing reference produces no edge.
    """
    out = []
    for row in rows:
        offset = row.get("clock_offset_ms")
        ref = row.get("clock_offset_reference_id")
        evidence_id = row.get("evidence_id")
        if offset is None or not ref or not evidence_id or ref == evidence_id:
            continue
        out.append({
            "id": f"ann:{evidence_id}",
            "a_evidence": ref,
            "b_evidence": evidence_id,
            "offset_ms": float(offset),
            "bound_ms": 0.0,
            "basis": "known_offset",
            "status": "declared",
        })
    return out
