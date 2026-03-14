import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const wsId = request.nextUrl.searchParams.get("wsId");
  if (!wsId) {
    return NextResponse.json({ error: "wsId is required" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: workspace } = await supabase
    .from("workspaces")
    .select("owner_id")
    .eq("id", wsId)
    .single();
  if (!workspace || workspace.owner_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const statePayload = {
    wsId,
    userId: user.id,
    nonce: crypto.randomUUID(),
  };
  const state = Buffer.from(JSON.stringify(statePayload)).toString("base64url");

  const redirectUri =
    process.env.NODE_ENV === "development"
      ? "http://localhost:3000/api/slack/callback"
      : "https://zenshin-web-alpha.vercel.app/api/slack/callback";

  const slackAuthUrl = new URL("https://slack.com/oauth/v2/authorize");
  slackAuthUrl.searchParams.set("client_id", process.env.SLACK_CLIENT_ID!);
  slackAuthUrl.searchParams.set(
    "scope",
    "chat:write,channels:read,groups:read"
  );
  slackAuthUrl.searchParams.set("redirect_uri", redirectUri);
  slackAuthUrl.searchParams.set("state", state);

  const response = NextResponse.redirect(slackAuthUrl.toString());

  response.cookies.set("slack_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  return response;
}
