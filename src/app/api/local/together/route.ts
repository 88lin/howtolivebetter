import { jsonResponse, readBody, readConversation, requireLocalUser, serviceError, updateConversation } from "@/lib/local-store";

export const runtime = "nodejs";

export function GET(request: Request) {
  try { return jsonResponse(readConversation(requireLocalUser(request), new URL(request.url).searchParams.get("code"))); }
  catch (error) { return serviceError(error); }
}

export async function POST(request: Request) {
  try {
    const input = await readBody(request);
    return jsonResponse(updateConversation(requireLocalUser(request), input));
  } catch (error) { return serviceError(error); }
}
