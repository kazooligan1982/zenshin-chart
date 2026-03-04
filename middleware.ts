import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  // Cron API はミドルウェアをスキップ（独自のBearer認証を使用）
  if (request.nextUrl.pathname.startsWith("/api/cron")) {
    return NextResponse.next();
  }

  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();


  const isAuthPage =
    request.nextUrl.pathname.startsWith("/login") ||
    request.nextUrl.pathname.startsWith("/signup") ||
    request.nextUrl.pathname.startsWith("/forgot-password") ||
    request.nextUrl.pathname.startsWith("/reset-password") ||
    request.nextUrl.pathname.startsWith("/auth");

  // 招待受諾ページ（未ログインでもアクセス可）
  const isInvitePage = request.nextUrl.pathname.startsWith("/invite");

  // /workspaces 配下は認証必須（layout.tsx で WS メンバーシップ確認）

  // 未ログインで保護されたページにアクセスした場合
  if (!user && !isAuthPage && !isInvitePage) {
    const url = request.nextUrl.clone();
    const redirectPath = request.nextUrl.pathname + request.nextUrl.search;
    url.pathname = "/login";
    url.searchParams.set("redirect", redirectPath);
    return NextResponse.redirect(url);
  }

  // ログイン済みで認証ページにアクセスした場合（招待ページは除く）
  // /charts にリダイレクトし、charts ページでデフォルトWSへリダイレクト
  if (
    user &&
    isAuthPage &&
    !request.nextUrl.pathname.startsWith("/auth/callback")
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/charts";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * Feel free to modify this pattern to include more paths.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};


