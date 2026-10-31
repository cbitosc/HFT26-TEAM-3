import pytest

from app.services.actor_labels import parse


def test_visual_label_output_is_allowlisted_and_track_bound():
    got = parse('{"suggestions":[{"track_id":7,"object_type":"motorcycle","color":"black","role":"near incident","confidence":0.82,"uncertainty":"partly occluded"}]}', {7})
    assert got[0]["label"] == "Vehicle · black motorcycle"
    assert got[0]["track_id"] == 7 and got[0]["confidence"] == 0.82


@pytest.mark.parametrize("payload", [
    '{"suggestions":[{"track_id":99,"object_type":"car","color":"white","confidence":0.8}]}',
    '{"suggestions":[{"track_id":7,"object_type":"BMW","color":"white","confidence":0.8}]}',
    '{"suggestions":[{"track_id":7,"object_type":"car","color":"white","confidence":1.2}]}',
])
def test_visual_label_output_rejects_untrusted_values(payload):
    with pytest.raises(ValueError):
        parse(payload, {7})
