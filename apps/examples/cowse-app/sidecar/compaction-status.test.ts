import { describe, expect, it, vi } from "vitest";
import { compactionNoticeState } from "./compaction-status";
import {
	createSidecarContext,
	handleCoreSessionEvent,
	handleHubLiveEvent,
} from "./context";
import { handleChatSessionCommand } from "./chat-session";
import type { LiveSession } from "./types";

describe("Core compaction status bridge", () => {
	it("handles overflow recovery metadata retained by older Core adapters", () => {
		expect(
			compactionNoticeState({
				metadata: { reason: "overflow_recovery_compaction", phase: "started" },
			}),
		).toBe(true);
		expect(
			compactionNoticeState({
				metadata: {
					reason: "overflow_recovery_compaction",
					phase: "completed",
				},
			}),
		).toBe(false);
	});
	it.each([
		"auto_compaction",
		"manual_compaction",
		"overflow_recovery_compaction",
	])("recognizes %s phases without matching English text", (reason) => {
		expect(
			compactionNoticeState({ reason, metadata: { phase: "started" } }),
		).toBe(true);
		for (const phase of ["completed", "skipped", "failed"])
			expect(compactionNoticeState({ reason, metadata: { phase } })).toBe(
				false,
			);
		expect(
			compactionNoticeState({
				reason,
				metadata: { phase: "started" },
				parentAgentId: "child-parent",
			}),
		).toBeUndefined();
		expect(
			compactionNoticeState({
				reason: "api_error",
				metadata: { phase: "started" },
			}),
		).toBeUndefined();
	});
	it.each([
		false,
		true,
	])("projects start/end and provides re-entry snapshots (Hub attachment: %s)", async (attachedViaHub) => {
		const ctx = createSidecarContext("/tmp");
		const send = vi.fn();
		ctx.wsClients.add({ send });
		ctx.liveSessions.set("compaction-test", {
			config: {},
			messages: [],
			promptsInQueue: [],
			status: "running",
			busy: true,
			attachedViaHub,
		} as unknown as LiveSession);
		const notice = (phase: string) => {
			const payload = {
				noticeType: "status",
				reason: "auto_compaction",
				message: "auto-compacting",
				metadata: { phase },
			};
			if (attachedViaHub)
				handleHubLiveEvent(ctx, {
					event: "session.notice",
					sessionId: "compaction-test",
					payload,
				});
			else
				handleCoreSessionEvent(ctx, {
					type: "agent_event",
					payload: {
						sessionId: "compaction-test",
						event: { type: "notice", ...payload },
					},
				} as Parameters<typeof handleCoreSessionEvent>[1]);
		};
		notice("started");
		notice("started");
		const events = () =>
			send.mock.calls
				.map(([raw]) => JSON.parse(raw).event)
				.filter((e) => e.name === "chat_compaction_status");
		expect(events()).toHaveLength(1);
		expect(
			await handleChatSessionCommand(ctx, {
				action: "compaction_status",
				sessionId: "compaction-test",
			}),
		).toMatchObject({ active: true });
		notice("completed");
		expect(events().at(-1).payload.active).toBe(false);
		notice("started");
		if (attachedViaHub)
			handleHubLiveEvent(ctx, {
				event: "run.aborted",
				sessionId: "compaction-test",
			});
		else
			handleCoreSessionEvent(ctx, {
				type: "ended",
				payload: { sessionId: "compaction-test", reason: "aborted" },
			} as Parameters<typeof handleCoreSessionEvent>[1]);
		expect(
			await handleChatSessionCommand(ctx, {
				action: "compaction_status",
				sessionId: "compaction-test",
			}),
		).toMatchObject({ active: false });
	});
});
