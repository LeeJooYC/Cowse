import { describe, expect, it } from "vitest";
import { reasoningChoices } from "./model-runtime-settings";

describe("reasoning choices", () => {
	it("uses explicit toggles without known strengths", () => {
		for (const options of [undefined, [], [{ type: "toggle" as const }]]) {
			expect(reasoningChoices(options)).toEqual(["on", "none"]);
		}
	});
	it("retains supported strengths and removes default", () => {
		expect(reasoningChoices([{ type: "effort", values: ["default", "low", "high"] }])).toEqual(["low", "high"]);
	});
});
