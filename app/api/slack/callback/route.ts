import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const error = request.nextUrl.searchParams.get("error");

  const baseUrl =
    process.env.NODE_ENV === "development"
      ? "http://localhost:3000"
      : "https://zenshin-web-alpha.vercel.app";

  if (error) {
    return NextResponse.redirect(`${baseUrl}?slack_error=${error}`);
  }

  if (!code || !state) {
    return NextResponse.json(
      { error: "Missing code or state" },
      { status: 400 }
    );
  }

  const savedState = request.cookies.get("slack_oauth_state")?.value;
  if (!savedState || savedState !== state) {
    return NextResponse.json({ error: "Invalid state" }, { status: 403 });
  }

  let statePayload: { wsId: string; userId: string; nonce: string };
  try {
    statePayload = JSON.parse(Buffer.from(state, "base64url").toString());
  } catch {
    return NextResponse.json(
      { error: "Invalid state format" },
      { status: 400 }
    );
  }

  const { wsId, userId } = statePayload;

  const redirectUri =
    process.env.NODE_ENV === "development"
      ? "http://localhost:3000/api/slack/callback"
      : "https://zenshin-web-alpha.vercel.app/api/slack/callback";

  const tokenResponse = await fetch("https://slack.com/api/oauth.v2.access", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.SLACK_CLIENT_ID!,
      client_secret: process.env.SLACK_CLIENT_SECRET!,
      code,
      redirect_uri: redirectUri,
    }),
  });

  const tokenData = await tokenResponse.json();

  if (!tokenData.ok) {
    console.error("Slack OAuth error:", tokenData.error);
    return NextResponse.redirect(
      `${baseUrl}/workspaces/${wsId}/settings/slack?error=oauth_failed`
    );
  }

  const supabase = createServiceRoleClient();

  const { error: dbError } = await supabase
    .from("workspace_slack_settings")
    .upsert(
      {
        workspace_id: wsId,
        slack_team_id: tokenData.team.id,
        slack_team_name: tokenData.team.name,
        slack_bot_token: tokenData.access_token,
        slack_channel_id: "",
        slack_channel_name: "",
        connected_by: userId,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: "workspace_id",
      }
    );

  if (dbError) {
    console.error("DB save error:", dbError);
    return NextResponse.redirect(
      `${baseUrl}/workspaces/${wsId}/settings/slack?error=db_failed`
    );
  }

  const response = NextResponse.redirect(
    `${baseUrl}/workspaces/${wsId}/settings/slack?connected=true`
  );

  response.cookies.delete("slack_oauth_state");

  return response;
}
