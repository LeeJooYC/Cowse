import type { SessionStatusTone } from "@cline/ui";

/**
 * Session status presentation shared by every surface that renders a status
 * dot (chat header, sessions view, sidebar). Keeping the mapping in one place
 * means a session cannot look green in one view and grey in another.
 */
/** Localized presentation only; protocol status values remain unchanged. */
export function sessionStatusLabel(status?: string): string {
	const labels: Record<string, string> = {
		idle: "空闲",
		starting: "正在启动",
		stopping: "正在停止",
		running: "运行中",
		completed: "已完成",
		failed: "失败",
		error: "出错",
		cancelled: "已取消",
		unresolved: "未记录结果",
		pending: "等待中",
		queued: "排队中",
		interrupted: "已中断",
		stopped: "已停止",
	};
	return status ? (labels[status] ?? status) : "未知";
}

export function sessionStatusTone(status?: string): SessionStatusTone {
	if (status === "running") {
		return "running";
	}
	if (status === "failed" || status === "error") {
		return "error";
	}
	return "neutral";
}

export function sessionStatusColor(status?: string): string {
	switch (sessionStatusTone(status)) {
		case "running":
			return "var(--color-green-500)";
		case "error":
			return "var(--color-red-500)";
		default:
			return "var(--color-gray-500)";
	}
}
