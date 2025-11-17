import { useEffect } from "react";
import { isRouteErrorResponse, useNavigate, useRouteError } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";

const RouteError = () => {
  const error = useRouteError();
  const navigate = useNavigate();

  useEffect(() => {
    console.error("Route error", error);
  }, [error]);

  const { title, description, detail, raw } = (() => {
    if (isRouteErrorResponse(error)) {
      return {
        title: `${error.status} ${error.statusText}`,
        description: "The cost dashboard couldn’t load this route.",
        detail: error.data?.message ?? "Please try again.",
        raw: JSON.stringify(error, null, 2)
      };
    }
    if (error instanceof Error) {
      return {
        title: "Unexpected error",
        description: error.message,
        detail: error.stack,
        raw: error.stack
      };
    }
    return {
      title: "Something went wrong",
      description: "The dashboard hit an unexpected issue.",
      detail: undefined,
      raw: typeof error === "string" ? error : JSON.stringify(error)
    };
  })();

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-background p-6">
      <Card className="w-full max-w-xl border-destructive/40 bg-background/80">
        <CardHeader>
          <Badge variant="destructive" className="w-fit">💿 Hey developer 👋</Badge>
          <CardTitle className="text-2xl">{title}</CardTitle>
          <p className="text-sm text-muted-foreground">{description}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {detail && (
            <pre className="max-h-64 overflow-auto rounded-md border border-border/60 bg-muted/10 p-3 text-xs text-muted-foreground">
              {detail}
            </pre>
          )}
          {raw && raw !== detail && (
            <pre className="max-h-40 overflow-auto rounded-md border border-border/40 bg-muted/5 p-3 text-[11px] text-muted-foreground">
              {raw}
            </pre>
          )}
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => navigate(0)}>Reload page</Button>
            <Button variant="outline" onClick={() => navigate("/")}>Go to Overview</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default RouteError;
