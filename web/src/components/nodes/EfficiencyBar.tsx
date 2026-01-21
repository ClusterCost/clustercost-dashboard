import { Progress } from "@/components/ui/progress";
import { formatCurrency } from "../../lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface EfficiencyBarProps {
    usagePercent: number;
    requestPercent: number;
    costPerMonth: number;
    usageAbsolute: number;
    totalAbsolute: number;
    unit: string;
}

export function EfficiencyBar({
    usagePercent,
    requestPercent,
    costPerMonth,
    usageAbsolute,
    totalAbsolute,
    unit
}: EfficiencyBarProps) {
    // FinOps Logic:
    // Gap between Usage (Cyan) and Reserved (White) = Waste.

    const wastePercent = Math.max(0, requestPercent - usagePercent);
    const wastedCost = costPerMonth * (wastePercent / 100);

    return (
        <div className="w-full min-w-[140px] flex flex-col gap-1 py-1">
            {/* Micro-Text Label: "1.2 / 4.0 vCPUs" */}
            <div className="flex justify-between items-end px-0.5">
                <span className="font-mono text-[10px] text-muted-foreground">
                    <span className="font-bold text-foreground">{usageAbsolute.toFixed(1)}</span>
                    <span className="opacity-70"> / {totalAbsolute.toFixed(1)} {unit}</span>
                </span>
                {wastePercent > 0 && (
                    <span className="text-[9px] text-destructive/80 font-mono tracking-tight">
                        Gap: {wastePercent.toFixed(0)}%
                    </span>
                )}
            </div>

            {/* Stacked Progress Bar */}
            <TooltipProvider delayDuration={0}>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <div className="relative h-2.5 w-full bg-muted/20 rounded-sm overflow-hidden cursor-help">
                            {/* Layer 1: Reserved (Requests) - Light/White */}
                            <div
                                className="absolute top-0 left-0 h-full bg-primary/20 dark:bg-slate-300/80 z-10"
                                style={{ width: `${Math.min(requestPercent, 100)}%` }}
                            />

                            {/* Layer 2: Actual Usage - Cyan */}
                            <div
                                className="absolute top-0 left-0 h-full bg-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.6)] z-20 mix-blend-normal"
                                style={{ width: `${Math.min(usagePercent, 100)}%` }}
                            />
                        </div>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-xs max-w-[200px] bg-slate-950 border-slate-800">
                        <div className="space-y-1">
                            <p className="font-semibold border-b border-white/10 pb-1 mb-1 text-slate-200">Efficiency Gap</p>
                            <div className="flex justify-between gap-4 text-slate-300">
                                <span>Usage:</span>
                                <span className="font-mono text-cyan-400">{usagePercent.toFixed(1)}% ({usageAbsolute.toFixed(2)} {unit})</span>
                            </div>
                            <div className="flex justify-between gap-4 text-slate-300">
                                <span>Reserved:</span>
                                <span className="font-mono text-slate-400">{requestPercent.toFixed(1)}%</span>
                            </div>
                            <div className="flex justify-between gap-4 text-slate-300">
                                <span>Total:</span>
                                <span className="font-mono text-slate-500">{totalAbsolute.toFixed(1)} {unit}</span>
                            </div>
                            {wastedCost > 1 && (
                                <div className="flex justify-between gap-4 pt-1 border-t border-white/10 text-red-400 font-bold">
                                    <span>Waste:</span>
                                    <span>{formatCurrency(wastedCost)}/mo</span>
                                </div>
                            )}
                        </div>
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>
        </div>
    );
}
