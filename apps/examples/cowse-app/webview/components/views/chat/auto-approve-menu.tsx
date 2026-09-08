import { ShieldCheck } from "lucide-react";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { AUTO_APPROVE_OPTIONS, type AutoApprove } from "@/lib/auto-approve";

export function AutoApproveMenu({
	value,
	disabled,
	onChange,
}: {
	value: AutoApprove;
	disabled: boolean;
	onChange?: (value: AutoApprove) => void;
}) {
	const count = AUTO_APPROVE_OPTIONS.filter(({ key }) => value[key]).length;
	return (
		<Popover>
			<PopoverTrigger asChild>
				<button
					type="button"
					aria-label="自动允许"
					title={`自动允许：${count}/5 项`}
					disabled={disabled || !onChange}
					className="flex size-7 shrink-0 items-center justify-center rounded-md hover:bg-surface-hover disabled:opacity-50"
				>
					<ShieldCheck className="size-3.5" />
				</button>
			</PopoverTrigger>
			<PopoverContent align="end" className="w-72 space-y-3">
				<div className="font-medium">自动允许</div>
				<p className="text-xs text-muted-foreground">
					勾选后，无需再次确认即可执行对应操作。未勾选的操作仍需审批。下次发送或处理当前审批后生效；已弹出的审批仍需手动确认。
				</p>
				{AUTO_APPROVE_OPTIONS.map(({ key, label, description }) => (
					<label
						key={key}
						className="flex cursor-pointer items-start gap-3 text-sm"
					>
						<input
							type="checkbox"
							aria-label={label}
							className="mt-1 accent-primary"
							checked={value[key]}
							disabled={disabled}
							onChange={(event) =>
								onChange?.({ ...value, [key]: event.target.checked })
							}
						/>
						<span>
							{label}
							<span className="mt-0.5 block text-xs text-muted-foreground">
								{description}
							</span>
						</span>
					</label>
				))}
			</PopoverContent>
		</Popover>
	);
}
