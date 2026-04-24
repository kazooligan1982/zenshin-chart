import { Resend } from "resend";
import { logger } from "@/lib/logger";

const resend = new Resend(process.env.RESEND_API_KEY);

// ドメイン検証完了前は onboarding@resend.dev を使用
// 検証完了後に noreply@u2c.io に変更する
const FROM_EMAIL =
  process.env.RESEND_FROM_EMAIL || "ZENSHIN CHART <onboarding@resend.dev>";

export async function sendInvitationEmail({
  to,
  workspaceName,
  inviterName,
  role,
  inviteUrl,
}: {
  to: string;
  workspaceName: string;
  inviterName: string;
  role: string;
  inviteUrl: string;
}) {
  const roleLabel =
    {
      consultant: "コンサルタント",
      editor: "編集者",
      viewer: "閲覧者",
    }[role] || role;

  const { data, error } = await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: `${workspaceName} への招待 — ZENSHIN CHART`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2>ZENSHIN CHART への招待</h2>
        <p>${inviterName} さんから <strong>${workspaceName}</strong> への招待が届いています。</p>
        <p>ロール: <strong>${roleLabel}</strong></p>
        <div style="margin: 32px 0;">
          <a href="${inviteUrl}"
             style="background-color: #F97316; color: white; padding: 12px 24px;
                    border-radius: 8px; text-decoration: none; font-weight: bold;">
            招待を受ける
          </a>
        </div>
        <p style="color: #666; font-size: 14px;">
          このリンクは7日間有効です。<br>
          心当たりがない場合は、このメールを無視してください。
        </p>
      </div>
    `,
  });

  if (error) {
    logger.error("Failed to send invitation email:", error);
    throw new Error("メールの送信に失敗しました");
  }

  return data;
}
