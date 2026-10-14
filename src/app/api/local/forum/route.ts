import { jsonResponse, readBody, readForum, requireLocalUser, serviceError, updateForum } from "@/lib/local-store";

export const runtime = "nodejs";

export function GET(request: Request) {
  try { return jsonResponse(readForum(request)); }
  catch (error) { return serviceError(error); }
}

export async function POST(request: Request) {
  try {
    const input = await readBody(request);
    return jsonResponse(updateForum(requireLocalUser(request), input));
  } catch (error) { return serviceError(error); }
}
