export const dynamic = "force-dynamic";
import { redirect } from "next/navigation";

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ wsId: string }>;
}) {
  const { wsId } = await params;
  redirect(`/workspaces/${wsId}/settings/archive`);
}
