import { jsonResponse, readBody, readProgress, requireLocalUser, serviceError, updateProgress } from "@/lib/local-store";

export const runtime = "nodejs";

export function GET(request: Request) {
  try { return jsonResponse(readProgress(requireLocalUser(request))); }
  catch (error) { return serviceError(error); }
}

export async function PUT(request: Request) {
  try {
    const input = await readBody(request);
    return jsonResponse(updateProgress(requireLocalUser(request), input));
  } catch (error) { return serviceError(error); }
}
