// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
	readAutoApprove,
	resolveAutoApprove,
	saveAutoApprove,
} from "./auto-approve";
import { getInitialChatConfig } from "@/hooks/chat-session/constants";
import { ChatSessionConfigSchema } from "./chat-schema";

afterEach(() => window.localStorage.clear());
describe("auto approval preferences", () => {
	it("preserves explicit off choices across new sessions and schema validation", () => {
		const value = {
			read: true,
			edit: false,
			commands: false,
			web: true,
			mcp: false,
		};
		saveAutoApprove(value);
		expect(readAutoApprove()).toEqual(value);
		expect(
			ChatSessionConfigSchema.parse(getInitialChatConfig()).autoApprove,
		).toEqual(value);
	});
	it("respects the legacy all-off setting", () => {
		expect(
			Object.values(resolveAutoApprove(undefined, false)).every(
				(enabled) => !enabled,
			),
		).toBe(true);
	});
});
