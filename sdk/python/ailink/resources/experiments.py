"""Resource for experiment tracking (A/B testing for prompts and models).

.. note::
    The experiment tracking API endpoints (P4.2) are not yet deployed.
    All methods on this resource raise ``NotImplementedError`` as a clear
    placeholder rather than silently returning empty results.
    Remove the stubs once P4.2 ships.
"""

from typing import Any, Dict, List, Optional

from ..exceptions import raise_for_status


class ExperimentsResource:
    """Management API resource for experiment tracking.

    Run A/B experiments to compare models, prompts, or routing strategies.

    Usage (once P4.2 API ships)::

        exp = admin.experiments.create(
            name="gpt4o-vs-claude",
            variants=[
                {"name": "control", "weight": 50, "set_body_fields": {"model": "gpt-4o"}},
                {"name": "treatment", "weight": 50, "set_body_fields": {"model": "claude-3-5-sonnet"}},
            ],
        )
        results = admin.experiments.results(exp["id"])
    """

    _NOT_YET = (
        "Experiment tracking API endpoints (P4.2) are not yet deployed on the gateway. "
        "Watch the changelog for the release that includes experiment API support."
    )

    def __init__(self, client) -> None:
        self._client = client

    def create(
        self,
        name: str,
        variants: List[Dict[str, Any]],
        scope: str = "project",
        project_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Create an A/B experiment.

        Args:
            name: Unique experiment name.
            variants: List of variant dicts. Each variant must have ``name``,
                ``weight`` (integer, all weights sum to 100), and
                ``set_body_fields`` (dict of overrides applied to matched requests).
            scope: ``"project"`` (default) or ``"org"``.
            project_id: Optional project scoping.

        Raises:
            NotImplementedError: Until P4.2 API endpoints are deployed.
        """
        raise NotImplementedError(self._NOT_YET)

    def list(self, project_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """List all experiments.

        Raises:
            NotImplementedError: Until P4.2 API endpoints are deployed.
        """
        raise NotImplementedError(self._NOT_YET)

    def results(self, experiment_id: str) -> Dict[str, Any]:
        """Get aggregated results for an experiment by variant.

        Returns token usage, latency, and cost breakdown per variant.

        Raises:
            NotImplementedError: Until P4.2 API endpoints are deployed.
        """
        raise NotImplementedError(self._NOT_YET)

    def stop(self, experiment_id: str) -> Dict[str, Any]:
        """Stop a running experiment.

        Raises:
            NotImplementedError: Until P4.2 API endpoints are deployed.
        """
        raise NotImplementedError(self._NOT_YET)


class AsyncExperimentsResource:
    """Async variant of ExperimentsResource."""

    _NOT_YET = ExperimentsResource._NOT_YET

    def __init__(self, client) -> None:
        self._client = client

    async def create(self, *args, **kwargs):
        raise NotImplementedError(self._NOT_YET)

    async def list(self, *args, **kwargs):
        raise NotImplementedError(self._NOT_YET)

    async def results(self, experiment_id: str):
        raise NotImplementedError(self._NOT_YET)

    async def stop(self, experiment_id: str):
        raise NotImplementedError(self._NOT_YET)
