import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { DistanceUnitService } from "@/server/auth/distance-unit";
import { requirePersonalContext } from "@/serverFunctions/middleware";
import { DistanceUnit, distanceUnitForCountry } from "@/shared/distance-unit";

export const getDistanceUnit = createServerFn({ method: "GET" })
  .middleware(requirePersonalContext)
  .handler(({ context }) =>
    DistanceUnitService.get({
      userId: context.userId,
      fallback: distanceUnitForCountry(
        getRequest().headers.get("cf-ipcountry"),
      ),
    }),
  );

export const setDistanceUnit = createServerFn({ method: "POST" })
  .middleware(requirePersonalContext)
  .validator(z.object({ unit: z.enum(DistanceUnit) }))
  .handler(({ data, context }) =>
    DistanceUnitService.set({ userId: context.userId, unit: data.unit }),
  );
