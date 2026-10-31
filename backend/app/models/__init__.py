"""Import every model module so Base.metadata is complete (Alembic autogenerate and tests rely on this)."""
from app.models.analysis import (  # noqa: F401
    Detection,
    ModelRun,
    SensorRecord,
    SensorSource,
    VehicleTrack,
    Witness,
    WitnessClaim,
    WitnessStatement,
)
from app.models.core import Camera, Case, EvidenceFile, ExtractedFrame, User, VideoMetadata  # noqa: F401
from app.models.ops import AuditLog, LlmCall, ProcessingJob  # noqa: F401
from app.models.reconstruction import (  # noqa: F401
    Actor,
    ActorLink,
    SourceAnnotation,
    Annotation,
    Contradiction,
    Corroboration,
    Event,
    EventSource,
    EventSummary,
    InvestigationFinding,
    ReconstructionScenario,
    Report,
    SyncGroup,
    Trajectory,
    VehicleAssociation,
)
from app.models.engine import ClockRecord, GapRecord, SourceEvent, SyncEdge  # noqa: E402,F401
