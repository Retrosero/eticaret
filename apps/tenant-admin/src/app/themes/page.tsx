import { Heading } from '@eticart/ui';
import { ThemesClient } from './ThemesClient';

export default function ThemesPage() {
  return (
    <div className="space-y-6">
      <div>
        <Heading level={1}>Tema yönetimi</Heading>
        <p className="mt-1 text-sm text-muted-foreground">
          Mağaza temasını taslak olarak hazırla, yayınla ve gerekirse önceki sürüme dön.
        </p>
      </div>
      <ThemesClient />
    </div>
  );
}
