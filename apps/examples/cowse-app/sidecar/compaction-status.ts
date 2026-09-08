import type { SidecarContext } from "./types";

/** Core sends structured notices, not model text. Ignore child-agent activity. */
export function compactionNoticeState(notice: {
	reason?: unknown;
	metadata?: unknown;
	parentAgentId?: unknown;
}): boolean | undefined {
	if (notice.parentAgentId) return;
	const metadata = notice.metadata as
		| { phase?: unknown; reason?: unknown }
		| undefined;
	// Older Core adapters omit overflow recovery from the top-level reason
	// enum, but retain the original structured reason in metadata.
	const reason = notice.reason ?? metadata?.reason;
	if (
		![
			"auto_compaction",
			"manual_compaction",
			"overflow_recovery_compaction",
		].includes(String(reason))
	)
		return;
	const phase = metadata?.phase;
	if (phase === "started") return true;
	if (["completed", "skipped", "failed"].includes(String(phase))) return false;
}

export function setCompactionStatus(
	ctx: SidecarContext,
	sessionId: string,
	active: boolean,
): void {
	const session = ctx.liveSessions.get(sessionId);
	if (!session || Boolean(session.isCompacting) === active) return;
	session.isCompacting = active;
	const event = JSON.stringify({
		type: "event",
		event: { name: "chat_compaction_status", payload: { sessionId, active } },
	});
	for (const client of ctx.wsClients) {
		try {
			client.send(event);
		} catch {
			/* A disconnected view reads a snapshot on reconnect. */
		}
	}
}
