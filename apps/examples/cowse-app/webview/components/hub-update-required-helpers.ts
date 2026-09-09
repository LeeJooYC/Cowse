/** Compatible build differences never trigger an update or blocking prompt. */
export function shouldShowHubMismatchDialog(
	reason: string | undefined,
): boolean {
	return reason === "unsupported_protocol" || reason === "outdated_hub";
}
export function describeOutdatedHubSessions(counts: {
	activeSessionCount?: number;
	participantClientCount?: number;
}): string {
	const sessions = counts.activeSessionCount;
	if (
		typeof sessions !== "number" ||
		!Number.isFinite(sessions) ||
		sessions <= 0
	)
		return "其他客户端的会话（当前活动数量未确认）";
	const clients = counts.participantClientCount;
	return typeof clients === "number" && Number.isFinite(clients) && clients > 0
		? clients + " 个客户端的 " + sessions + " 个活动会话"
		: sessions + " 个活动会话";
}
