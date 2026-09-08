import { describe, expect, it } from "vitest";
import { getBuiltinToolLabels } from "./builtin-tool-labels";

describe("builtin tool display translations", () => {
	it.each([
		"web_search",
		"read_files",
		"search_codebase",
		"run_commands",
		"editor",
		"fetch_web_content",
		"skills",
		"ask_question",
		"tasks",
		"spawn_agent",
		"teams",
	])("translates %s without mutating its runtime metadata", (id) => {
		const tool = Object.freeze({
			id,
			name: id,
			description: "Runtime description",
		});
		const labels = getBuiltinToolLabels(tool);
		expect(labels.name).toMatch(/[\u4e00-\u9fff]/);
		expect(labels.description).toMatch(/[\u4e00-\u9fff]/);
		expect(tool).toEqual({ id, name: id, description: "Runtime description" });
	});
	it("preserves unknown upstream tools", () => {
		expect(
			getBuiltinToolLabels({
				id: "future_tool",
				name: "Future tool",
				description: "New description",
			}),
		).toEqual({ name: "Future tool", description: "New description" });
	});
});
