import { createServerFn } from "@tanstack/react-start";
import { hasDataforseoAccess } from "@/server/lib/provider-access";
import { requirePersonalContext } from "@/serverFunctions/middleware";

export const getSeoApiKeyStatus = createServerFn({ method: "GET" })
  .middleware(requirePersonalContext)
  .handler(async () => {
    const configured = await hasDataforseoAccess();
    return { configured };
  });
