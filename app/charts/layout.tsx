import { Sidebar } from "@/components/sidebar";

export default function ChartsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <main className="pl-16 min-h-screen">{children}</main>
    </div>
  );
}
