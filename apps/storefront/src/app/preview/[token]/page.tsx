import TenantLayout from '../../[...slug]/layout';
import ThemeHomePage from '../../[...slug]/page';

export const dynamic = 'force-dynamic';

export default async function ThemePreviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <TenantLayout previewToken={token}>
      <ThemeHomePage previewToken={token} />
    </TenantLayout>
  );
}
