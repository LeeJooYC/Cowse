import { DefaultToolNames } from "@cline/core";
import { AutoApproveSchema } from "../webview/lib/auto-approve";
import type { JsonRecord } from "./types";

export function resolveToolPolicies(
	config: JsonRecord,
): Record<string, { autoApprove: boolean }> {
	if (config.autoApprove === undefined)
		return { "*": { autoApprove: config.autoApproveTools !== false } };
	const value = AutoApproveSchema.parse(config.autoApprove);
	return {
		"*": { autoApprove: false },
		[DefaultToolNames.READ_FILES]: { autoApprove: value.read },
		[DefaultToolNames.SEARCH_CODEBASE]: { autoApprove: value.read },
		[DefaultToolNames.EDITOR]: { autoApprove: value.edit },
		[DefaultToolNames.APPLY_PATCH]: { autoApprove: value.edit },
		[DefaultToolNames.RUN_COMMANDS]: { autoApprove: value.commands },
		[DefaultToolNames.FETCH_WEB_CONTENT]: { autoApprove: value.web },
		"mcp:*": { autoApprove: value.mcp },
		[DefaultToolNames.ASK]: { autoApprove: true },
		[DefaultToolNames.SUBMIT_AND_EXIT]: { autoApprove: true },
	};
}

/** Route category decisions through the host callback, which reads live settings.
 * Baking checkbox values into Core's start config makes them stale mid-turn.
 * Core still owns tool execution, availability and approval enforcement.
 */
export function resolveRuntimeToolPolicies(config: JsonRecord) {
	if (config.autoApprove === undefined) return resolveToolPolicies(config);
	return {
		"*": { autoApprove: false },
		[DefaultToolNames.ASK]: { autoApprove: true },
		[DefaultToolNames.SUBMIT_AND_EXIT]: { autoApprove: true },
	};
}

export function isToolAutoAllowed(
	config: JsonRecord | undefined,
	toolName: string,
): boolean {
	// Never auto-approve an unrelated Hub session without explicit host settings.
	if (!config?.autoApprove) return false;
	const policies = resolveToolPolicies(config);
	return (
		policies[toolName] ??
		(toolName.startsWith("mcp:") ? policies["mcp:*"] : undefined) ??
		policies["*"]
	).autoApprove;
}
