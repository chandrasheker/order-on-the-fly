import { enqueueJob } from "@/lib/job-queue";

export async function dispatchPrintJob(params: {
  restaurantId: string;
  type: "receipt" | "kitchen_chit";
  payload: Record<string, unknown>;
}) {
  return enqueueJob({
    type: "print_job",
    restaurantId: params.restaurantId,
    payload: {
      type: params.type,
      ...params.payload,
    },
  });
}
