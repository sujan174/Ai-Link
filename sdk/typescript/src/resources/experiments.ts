import type { JsonObject } from "../types.js";

const NOT_YET =
    "Experiment tracking API endpoints (P4.2) are not yet deployed on the gateway. " +
    "Watch the changelog for the release that includes experiment API support.";

export class ExperimentsResource {
    /** Create an A/B experiment. @throws NotImplementedError until P4.2 ships. */
    async create(_name: string, _variants: JsonObject[], _options?: { scope?: string; projectId?: string }): Promise<JsonObject> {
        throw new Error(NOT_YET);
    }

    /** List all experiments. @throws NotImplementedError until P4.2 ships. */
    async list(_options?: { projectId?: string }): Promise<JsonObject[]> {
        throw new Error(NOT_YET);
    }

    /** Get aggregated results for an experiment. @throws NotImplementedError until P4.2 ships. */
    async results(_experimentId: string): Promise<JsonObject> {
        throw new Error(NOT_YET);
    }

    /** Stop a running experiment. @throws NotImplementedError until P4.2 ships. */
    async stop(_experimentId: string): Promise<JsonObject> {
        throw new Error(NOT_YET);
    }
}
