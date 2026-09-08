"use client";

import {
	WorkActivity,
	WorkActivityContent,
	WorkActivityTrigger,
} from "@cline/ui/components/agent-chat";
import { memo, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { formatWorkLabel } from "@/lib/chat-labels";

/**
 * Collapsed summary row for a finished run's working rows. Expanding re-shows
 * the run's normal chat rows (tool calls, thinking traces, narration) under
 * the shared disclosure rail. Collapse state lives in the ui primitive, so
 * keying this block by the work item's stable id preserves it across renders.
 */
export const WorkBlock = memo(function WorkBlock({
	durationMilliseconds,
	toolCallCount,
	children,
}: {
	durationMilliseconds?: number;
	toolCallCount: number;
	children: ReactNode;
}) {
	return (
		<WorkActivity>
			<WorkActivityTrigger
				durationMilliseconds={durationMilliseconds}
				toolCallCount={toolCallCount}
			>
				<span className="cline-chat-tool-label">{formatWorkLabel(durationMilliseconds, toolCallCount)}</span>
				<ChevronDown className="cline-chat-disclosure-icon" />
			</WorkActivityTrigger>
			<WorkActivityContent>{children}</WorkActivityContent>
		</WorkActivity>
	);
});
