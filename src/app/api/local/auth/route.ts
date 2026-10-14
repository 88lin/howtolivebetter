import { authenticate, getLocalUser, jsonResponse, readBody, serviceError } from "@/lib/local-store";

export const runtime = "nodejs";

export function GET(request: Request) {
  try { return jsonResponse({ user: getLocalUser(request) }); }
  catch (error) { return serviceError(error); }
}

export async function POST(request: Request) {
  try { return authenticate(request, await readBody(request)); }
  catch (error) { return serviceError(error); }
}
