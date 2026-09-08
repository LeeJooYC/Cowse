import { buildToolSummary } from "@cline/ui/components/agent-chat/tool-summary";
import { describe, expect, it } from "vitest";
import { formatThoughtLabel, formatWorkLabel, localizeToolSummary } from "./chat-labels";
import { workspaceDisplayName } from "./sidebar-session-organization";
import { formatRelativeTime } from "@/hooks/use-session-history";

describe("Cowse Chinese chat presentation", () => {
	it("formats thinking and completed work, including unknown duration", () => {
		expect(formatThoughtLabel()).toBe("正在思考");
		expect(formatThoughtLabel(15_000)).toBe("已思考 15 秒");
		expect(formatWorkLabel(22_000, 1)).toBe("已运行 22 秒，调用了 1 次工具");
		expect(formatWorkLabel(72_000, 2)).toBe("已运行 1 分 12 秒，调用了 2 次工具");
		expect(formatWorkLabel(undefined, 0)).toBe("已完成");
	});
	it("localizes generated command labels without changing commands or results", () => {
		const summary = buildToolSummary({ toolName: "run_commands", input: { commands: ["echo Running"] }, result: "Running", inProgress: false });
		const localized = localizeToolSummary(summary);
		expect(localized.label).toContain("已运行");
		expect(localized.labelParts.filter((part) => part.code)).toEqual(summary.labelParts.filter((part) => part.code));
		expect(localized.items).toEqual(summary.items);
		expect(localized.outputText).toBe(summary.outputText);
		expect(summary.label).not.toContain("已运行");
	});
	it("distinguishes the managed chat workspace from a real folder named Chat", () => {
		expect(workspaceDisplayName("/Users/test/.cline/data/workspaces/chat")).toBe("即时会话");
		expect(workspaceDisplayName("/projects/Chat")).toBe("Chat");
		expect(workspaceDisplayName("/projects/General")).toBe("General");
	});
	it("uses Chinese relative times", () => {
		expect(formatRelativeTime(new Date().toISOString())).toBe("刚刚");
		expect(formatRelativeTime(new Date(Date.now() - 120_000).toISOString())).toBe("2分钟前");
	});
});
