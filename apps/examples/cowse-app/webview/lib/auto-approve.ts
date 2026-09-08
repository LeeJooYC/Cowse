import { z } from "zod";

export const AutoApproveSchema = z.object({
	read: z.boolean(),
	edit: z.boolean(),
	commands: z.boolean(),
	web: z.boolean(),
	mcp: z.boolean(),
});
export type AutoApprove = z.infer<typeof AutoApproveSchema>;
export const AUTO_APPROVE_OPTIONS = [
	{ key: "read", label: "读取文件", description: "读取文件和搜索代码" },
	{ key: "edit", label: "编辑文件", description: "创建、修改文件和应用补丁" },
	{
		key: "commands",
		label: "执行命令",
		description: "执行终端命令，可能修改文件或系统状态",
	},
	{ key: "web", label: "获取网页内容", description: "访问网页并读取内容" },
	{
		key: "mcp",
		label: "使用 MCP 服务",
		description: "调用已配置的 MCP 工具，可能操作外部服务",
	},
] as const;
const STORAGE_KEY = "cowse.autoApprove";

export function resolveAutoApprove(
	value: unknown,
	legacy?: boolean,
): AutoApprove {
	const parsed = AutoApproveSchema.safeParse(value);
	if (parsed.success) return parsed.data;
	const enabled = legacy !== false;
	return {
		read: enabled,
		edit: enabled,
		commands: enabled,
		web: enabled,
		mcp: enabled,
	};
}

export function readAutoApprove(): AutoApprove {
	try {
		return resolveAutoApprove(
			JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null"),
		);
	} catch {
		return resolveAutoApprove(undefined);
	}
}

export function saveAutoApprove(value: AutoApprove): void {
	window.localStorage.setItem(
		STORAGE_KEY,
		JSON.stringify(AutoApproveSchema.parse(value)),
	);
}
