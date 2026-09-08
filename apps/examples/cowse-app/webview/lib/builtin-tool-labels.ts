// Display-only translations: keep Cline's tool IDs and runtime descriptions intact.
const BUILTIN_TOOL_LABELS: Record<
	string,
	{ name: string; description: string }
> = {
	web_search: {
		name: "搜索网页",
		description: "使用所选模型供应商的原生搜索能力搜索公开网页。",
	},
	read_files: {
		name: "读取文件",
		description:
			"读取指定绝对路径下的文本或图片文件。可用 start_line/end_line 指定行范围（从第 1 行开始，包含首尾行）；长文件按范围分页读取。",
	},
	search_codebase: {
		name: "搜索代码库",
		description:
			"使用正则表达式搜索代码库中的代码片段、定义、导入语句及其他匹配文本。",
	},
	run_commands: {
		name: "运行命令",
		description:
			"在工作目录根目录运行终端命令，用于列出文件、检查 Git 状态、构建、测试等任务。",
	},
	editor: {
		name: "编辑文件",
		description: "通过创建、替换和插入操作，对文本文件进行受控编辑。",
	},
	fetch_web_content: {
		name: "读取网页",
		description: "获取指定网址的内容，并根据提示分析和提取所需信息。",
	},
	skills: {
		name: "执行技能",
		description: "当存在与任务匹配的已配置技能时，在当前会话中执行该技能。",
	},
	ask_question: {
		name: "向用户提问",
		description: "向用户提出一个澄清问题，并提供 2 至 5 个可选答案。",
	},
	tasks: {
		name: "管理计划任务",
		description: "按用户的明确要求，创建和管理一次性或周期性的智能体计划任务。",
	},
	spawn_agent: {
		name: "启动子智能体",
		description: "启动子智能体，委派独立子任务并获取执行结果。",
	},
	teams: {
		name: "团队协作",
		description:
			"启用团队协作工具，用于成员管理、任务协调、消息通信、任务日志及成果管理。",
	},
};

export function getBuiltinToolLabels(tool: {
	id: string;
	name: string;
	description?: string;
}): { name: string; description: string } {
	return (
		BUILTIN_TOOL_LABELS[tool.id] ?? {
			name: tool.name,
			description: tool.description?.trim() || "暂无说明。",
		}
	);
}
