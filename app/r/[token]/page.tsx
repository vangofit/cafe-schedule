import StaffPage from "@/components/StaffPage";

export const metadata = { title: "근무 요청 · 카페 A", robots: { index: false } };

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <StaffPage token={token} />;
}
