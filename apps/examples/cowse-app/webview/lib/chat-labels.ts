import type { ToolSummary } from "@cline/ui/components/agent-chat/tool-summary";

/** Cowse presentation only: never translate tool inputs, outputs or identifiers. */
export function formatThoughtLabel(durationMilliseconds?: number): string {
	if (durationMilliseconds === undefined) return "正在思考";
	const seconds = durationMilliseconds === 0 ? 0 : Math.max(1, Math.round(durationMilliseconds / 1000));
	return `已思考 ${seconds} 秒`;
}

export function formatWorkLabel(durationMilliseconds: number | undefined, toolCallCount: number): string {
	const hasDuration = durationMilliseconds !== undefined && Number.isFinite(durationMilliseconds) && durationMilliseconds >= 0;
	const seconds = hasDuration ? Math.round(durationMilliseconds / 1000) : 0;
	const duration = seconds >= 60 ? `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒` : `${seconds} 秒`;
	const worked = hasDuration ? `已运行 ${duration}` : "已完成";
	return toolCallCount > 0 ? `${worked}，调用了 ${toolCallCount} 次工具` : worked;
}

const verbs: Record<string, string> = {
	Reading: "正在读取", Read: "已读取", Editing: "正在编辑", Edited: "已编辑",
	Running: "正在运行", Ran: "已运行", Exploring: "正在检索", Explored: "已检索",
	Spawning: "正在启动", Spawned: "已启动",
};
const nouns: Record<string, string> = {
	file: "个文件", files: "个文件", command: "条命令", commands: "条命令",
	search: "次搜索", searches: "次搜索", link: "个链接", links: "个链接",
	agent: "个智能体", agents: "个智能体",
};
const prefixes: Record<string, string> = {
	"Reading file": "正在读取文件", "Read file": "已读取文件",
	"Editing file": "正在编辑文件", "Edited file": "已编辑文件",
	"Running command": "正在运行命令", "Ran command": "已运行命令",
	"Fetching web content": "正在获取网页内容", "Fetched web content": "已获取网页内容",
	"Spawning agent": "正在启动智能体", "Spawned agent": "已启动智能体",
	"Using skill": "正在使用技能", "Used skill": "已使用技能",
	"Asking a question": "正在提问", "Asked a question": "已提问",
	"Calling MCP tool": "正在调用 MCP 工具", "Called MCP tool": "已调用 MCP 工具",
	"Applying patch": "正在应用补丁", "Applied patch": "已应用补丁",
	Searching: "正在搜索", Searched: "已搜索", Fetching: "正在获取", Fetched: "已获取",
	Created: "已创建", Creating: "正在创建", Deleted: "已删除", Deleting: "正在删除",
	Updated: "已更新", Updating: "正在更新", Replaced: "已替换", Replacing: "正在替换",
	Asking: "正在提问", Asked: "已提问",
};

export function localizeToolSummary(summary: ToolSummary): ToolSummary {
	// Unknown/MCP labels may be supplied externally; leave their contents intact.
	if (summary.kind === "generic" || summary.kind === "mcp") return summary;
	const labelParts = summary.labelParts.map((part, index) => {
		if (index !== 0 || part.code) return part;
		const aggregate = part.text.match(/^(Reading|Read|Editing|Edited|Running|Ran|Exploring|Explored|Spawning|Spawned) (\d+) (files?|commands?|search(?:es)?|links?|agents?)$/);
		if (aggregate) return { ...part, text: `${verbs[aggregate[1]]} ${aggregate[2]} ${nouns[aggregate[3]]}` };
		for (const [english, chinese] of Object.entries(prefixes)) {
			if (part.text === english || part.text.startsWith(`${english} `) || part.text.startsWith(`${english}:`)) {
				return { ...part, text: chinese + part.text.slice(english.length) };
			}
		}
		return part;
	});
	return { ...summary, labelParts, label: labelParts.map((part) => part.text).join("") };
}
