import { MENU_IMPORT_JOB_TYPE } from "@/lib/menu-import/constants";
import { enqueueJob } from "@/lib/job-queue";

export async function enqueueMenuImportProcessing(importId: string, restaurantId: string) {
  return enqueueJob({
    type: MENU_IMPORT_JOB_TYPE,
    payload: { importId },
    restaurantId,
    maxAttempts: 1,
  });
}
