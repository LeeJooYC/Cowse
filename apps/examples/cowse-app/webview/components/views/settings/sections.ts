/**
 * Settings navigation constants, split from settings-view.tsx so the sidebar
 * (always mounted) can reference section names without pulling the entire
 * settings module graph — providers, MCP, marketplace, schedules — into the
 * initial chat bundle. The heavy views load on demand via next/dynamic.
 */

const ALL_SETTINGS_SECTIONS = [
	"General",
	"Models",
	"Voice",
	"Channels",
	"Schedules",
	"Account",
] as const;

// Customize is the unified hub for everything that extends Cline — skills,
// MCP servers, plugins, rules, hooks, and tools. "Customize" is the installed
// inventory (labeled "Installed" in the sidebar group); "Marketplace" is the
// dedicated browse-and-install directory.
const ALL_CUSTOMIZATION_SECTIONS = ["Customize", "Marketplace"] as const;

// Sidebar labels for the Customize group: the Customize section shows what is
// installed, so its row reads "Installed" next to the Marketplace row.
export const CUSTOMIZATION_SECTION_LABELS: Record<
	(typeof ALL_CUSTOMIZATION_SECTIONS)[number],
	string
> = {
	Customize: "已安装",
	Marketplace: "扩展市场",
};

export type SettingsSection =
	| (typeof ALL_SETTINGS_SECTIONS)[number]
	| "AccountUsage"
	| "AccountBilling"
	| (typeof ALL_CUSTOMIZATION_SECTIONS)[number];

export const ACCOUNT_SECTIONS = [
	"Account",
	"AccountUsage",
	"AccountBilling",
] as const;
export const ACCOUNT_SECTION_LABELS = {
	Account: "概览",
	AccountUsage: "用量",
	AccountBilling: "账单",
} as const;

// Temporarily hidden from the sidebar. The views and routes still exist —
// remove a section from this set to surface it again.
const HIDDEN_SECTIONS: ReadonlySet<SettingsSection> = new Set(["Channels"]);

export const SETTINGS_SECTIONS = ALL_SETTINGS_SECTIONS.filter(
	(section) => !HIDDEN_SECTIONS.has(section),
);

export const CUSTOMIZATION_SECTIONS = ALL_CUSTOMIZATION_SECTIONS.filter(
	(section) => !HIDDEN_SECTIONS.has(section),
);
