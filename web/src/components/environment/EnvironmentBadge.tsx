import { Badge } from "../ui/badge";
import { cn, environmentLabels, environmentStyle, type Environment } from "../../lib/utils";

interface EnvironmentBadgeProps {
  environment: Environment | "mixed";
  className?: string;
}

const mixedStyles = "border-primary/30 bg-primary/5 text-primary";

export const EnvironmentBadge = ({ environment, className }: EnvironmentBadgeProps) => {
  const styles = environment === "mixed" ? mixedStyles : environmentStyle[environment];
  const label = environment === "mixed" ? "Mixed" : environmentLabels[environment];
  return <Badge className={cn(styles, className)} variant="outline">{label}</Badge>;
};
