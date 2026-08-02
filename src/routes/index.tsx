import { createFileRoute, redirect } from "@tanstack/react-router";

/** 根路由预留给后续首页；当前临时转到事件追踪。 */
export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/events" });
  },
});
