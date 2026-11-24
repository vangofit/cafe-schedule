import StaffPage from "@/components/StaffPage";

export const metadata = { title: "월영당 · 근무 요청", robots: { index: false } };

export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <StaffPage token={token} />;
}
