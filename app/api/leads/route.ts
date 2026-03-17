import { handleTrialSubmit } from "@/lib/trial-submit";

export async function POST(request: Request) {
  return handleTrialSubmit(request);
}
