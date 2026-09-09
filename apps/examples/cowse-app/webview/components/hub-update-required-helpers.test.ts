import { expect, it } from "vitest";
import {
	shouldShowHubMismatchDialog,
	describeOutdatedHubSessions,
} from "./hub-update-required-helpers";
it("warns only about incompatible or outdated hubs", () => {
	expect(shouldShowHubMismatchDialog("unsupported_protocol")).toBe(true);
	expect(shouldShowHubMismatchDialog("outdated_hub")).toBe(true);
	for (const reason of [undefined, "build_mismatch", "unknown"])
		expect(shouldShowHubMismatchDialog(reason)).toBe(false);
});
it("uses Chinese counts without inventing activity when unknown", () => {
	expect(
		describeOutdatedHubSessions({
			activeSessionCount: 2,
			participantClientCount: 1,
		}),
	).toBe("1 个客户端的 2 个活动会话");
	expect(describeOutdatedHubSessions({ activeSessionCount: 4 })).toBe(
		"4 个活动会话",
	);
	expect(describeOutdatedHubSessions({})).toContain("未确认");
	expect(describeOutdatedHubSessions({ activeSessionCount: 0 })).toContain(
		"未确认",
	);
});
