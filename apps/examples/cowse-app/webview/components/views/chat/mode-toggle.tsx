import { cn } from "@/lib/utils";

export function ModeToggle({
	mode,
	disabled,
	onToggle,
}: {
	mode: "plan" | "act";
	disabled: boolean;
	onToggle: () => void;
}) {
	return (
		<div
			role="group"
			aria-label="会话模式"
			className="flex shrink-0 items-center overflow-hidden rounded-full border border-border"
		>
			{(["plan", "act"] as const).map((value) => (
				<button
					key={value}
					type="button"
					aria-label={value === "plan" ? "规划模式" : "执行模式"}
					aria-pressed={mode === value}
					disabled={disabled}
					title={
						value === "plan"
							? "规划：分析并制定计划，不修改项目文件"
							: "执行：执行任务，允许修改文件和调用工具"
					}
					className={cn(
						"px-2.5 py-1 text-xs disabled:opacity-50",
						mode === value
							? "bg-primary text-primary-foreground"
							: "hover:bg-surface-hover",
					)}
					onClick={() => {
						if (mode !== value) onToggle();
					}}
				>
					{value === "plan" ? "规划" : "执行"}
				</button>
			))}
		</div>
	);
}
