import { describe, expect, it } from "vitest";
import { createDesktopAppState, desktopAppReducer } from "./desktop-app-state";
import type { SessionHistoryItem } from "./session-history";

const settingsSection = "General" as const;

function createSession(sessionId: string): SessionHistoryItem {
	return {
		sessionId,
		status: "completed",
		provider: "test-provider",
		model: "test-model",
		cwd: "/workspace",
		workspaceRoot: "/workspace",
		startedAt: "2026-01-01T00:00:00.000Z",
	};
}

describe("desktopAppReducer", () => {
	it("preserves the current session while navigating settings and returning to chat", () => {
		let state = createDesktopAppState<string>("welcome", "General");
		state = desktopAppReducer(state, {
			type: "open-session",
			session: createSession("original"),
		});
		const originalThreads = state.threads;
		const originalId = state.navigation.current.activeThreadId;
		for (const section of [
			"General",
			"Customize",
			"Account",
			"AccountUsage",
			"AccountBilling",
		]) {
			state = desktopAppReducer(state, {
				type: "navigate",
				destination: {
					...state.navigation.current,
					view: "settings",
					settingsSection: section,
				},
			});
		}
		state = desktopAppReducer(state, { type: "back" });
		expect(state.navigation.current.settingsSection).toBe("AccountUsage");
		state = desktopAppReducer(state, { type: "forward" });
		expect(state.navigation.current.settingsSection).toBe("AccountBilling");
		state = desktopAppReducer(state, {
			type: "navigate",
			destination: { ...state.navigation.current, view: "chat" },
		});
		expect(state.navigation.current.activeThreadId).toBe(originalId);
		expect(state.threads).toEqual(originalThreads);
	});

	it("hands an edited prompt to a fork exactly once", () => {
		let state = createDesktopAppState("welcome", settingsSection);
		state = desktopAppReducer(state, {
			type: "open-session",
			session: createSession("forked-session"),
			initialPromptDraft: "Revise this prompt",
		});

		expect(
			state.threads.find((thread) => thread.id === "session_forked-session")
				?.initialPromptDraft,
		).toBe("Revise this prompt");

		state = desktopAppReducer(state, {
			type: "consume-initial-prompt-draft",
			threadId: "session_forked-session",
		});

		expect(
			state.threads.find((thread) => thread.id === "session_forked-session")
				?.initialPromptDraft,
		).toBeUndefined();
	});

	it("keeps both sessions deleted when deletion actions are queued together", () => {
		let state = createDesktopAppState("welcome", settingsSection);
		state = desktopAppReducer(state, {
			type: "open-session",
			session: createSession("session-a"),
		});
		state = desktopAppReducer(state, {
			type: "open-session",
			session: createSession("session-b"),
		});

		state = desktopAppReducer(state, {
			type: "delete-session",
			deletedSessionId: "session-a",
			fallbackThreadId: "fallback-a",
		});
		state = desktopAppReducer(state, {
			type: "delete-session",
			deletedSessionId: "session-b",
			fallbackThreadId: "fallback-b",
		});

		expect(state.threads.map((thread) => thread.id)).toEqual([
			"welcome",
			"fallback-b",
		]);
		expect(state.navigation.current.activeThreadId).toBe("fallback-b");
		expect([
			...state.navigation.back,
			state.navigation.current,
			...state.navigation.forward,
		]).not.toContainEqual(
			expect.objectContaining({ activeThreadId: "session_session-a" }),
		);
		expect([
			...state.navigation.back,
			state.navigation.current,
			...state.navigation.forward,
		]).not.toContainEqual(
			expect.objectContaining({ activeThreadId: "session_session-b" }),
		);
	});

	it("ignores a duplicate deletion after its thread and history are removed", () => {
		let state = createDesktopAppState("welcome", settingsSection);
		state = desktopAppReducer(state, {
			type: "open-session",
			session: createSession("session-a"),
		});
		const deletion = {
			type: "delete-session" as const,
			deletedSessionId: "session-a",
			fallbackThreadId: "fallback-a",
		};

		state = desktopAppReducer(state, deletion);
		expect(desktopAppReducer(state, deletion)).toBe(state);
	});

	it("returns a live current session to a fresh chat when it is deleted from the sidebar", () => {
		let state = createDesktopAppState("live-thread", settingsSection);
		state = desktopAppReducer(state, {
			type: "thread-started",
			threadId: "live-thread",
			sessionId: "cline-session-a",
		});

		state = desktopAppReducer(state, {
			type: "delete-session",
			deletedSessionId: "cline-session-a",
			fallbackThreadId: "fresh-chat",
		});

		expect(state.threads).toEqual([{ id: "fresh-chat" }]);
		expect(state.navigation.current).toEqual({
			activeThreadId: "fresh-chat",
			settingsSection,
			view: "chat",
		});
		expect([
			...state.navigation.back,
			state.navigation.current,
			...state.navigation.forward,
		]).not.toContainEqual(
			expect.objectContaining({ activeThreadId: "live-thread" }),
		);
	});
});
