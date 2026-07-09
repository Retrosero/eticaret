/**
 * Super Admin — Plan Yönetim Sayfası.
 */
import { Card, Heading, TrCurrency } from '@eticart/ui';
import { AdminShell } from '../layout';
import { requireSuperAdmin, getSuperAdminToken } from '../_lib/auth';
import { CreatePlanButton } from './CreatePlanButton';

interface Plan {
  id: string;
  code: string;
  name: string;
  description: string;
  monthlyPriceKurus: number;
  yearlyPriceKurus: number;
  currency: string;
  trialDays: number;
  maxUsers: number;
  maxProducts: number;
  maxOrdersPerMonth: number;
  maxStorageBytes: number;
  isActive: boolean;
  sortOrder: number;
}

async function fetchPlans(): Promise<Plan[] | null> {
  try {
    const res = await fetch(
      `${process.env['CONTROL_PLANE_API'] ?? 'http://localhost:4000'}/api/v1/super-admin/plans`,
      {
        headers: { Authorization: `Bearer ${await getSuperAdminToken() ?? ''}` },
        cache: 'no-store',
      },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { items: Plan[] };
    return data.items;
  } catch {
    return null;
  }
}

function formatStorage(bytes: number): string {
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(0)} GB`;
}

export default async function PlansPage() {
  await requireSuperAdmin();
  const plans = await fetchPlans();

  return (
    <AdminShell current="/plans">
      <div style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <Heading level={1}>Plan Yönetimi</Heading>
            <p style={{ color: '#6b7280' }}>
              SaaS abonelik planlarını yönet (CRUD).
            </p>
          </div>
          <CreatePlanButton />
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: '1rem',
          }}
        >
          {!plans || plans.length === 0 ? (
            <p>Henüz plan tanımlı değil.</p>
          ) : (
            plans
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map((plan) => (
                <Card key={plan.id} padding={true} elevation="shadow">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                    <Heading level={3}>{plan.name}</Heading>
                    {!plan.isActive && (
                      <span
                        style={{
                          padding: '0.125rem 0.5rem',
                          background: '#fee2e2',
                          color: '#991b1b',
                          borderRadius: 4,
                          fontSize: '0.75rem',
                        }}
                      >
                        Pasif
                      </span>
                    )}
                  </div>
                  <code
                    style={{
                      display: 'inline-block',
                      marginTop: '0.25rem',
                      background: '#f3f4f6',
                      padding: '0.125rem 0.375rem',
                      borderRadius: 4,
                      fontSize: '0.75rem',
                    }}
                  >
                    {plan.code}
                  </code>
                  <p style={{ color: '#6b7280', fontSize: '0.875rem', marginTop: '0.5rem' }}>
                    {plan.description}
                  </p>

                  <div
                    style={{
                      marginTop: '1rem',
                      paddingTop: '1rem',
                      borderTop: '1px solid #f3f4f6',
                    }}
                  >
                    <p style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>
                      <TrCurrency
                        amount={plan.monthlyPriceKurus}
                        currency={plan.currency as 'TRY' | 'USD' | 'EUR' | 'GBP'}
                      />
                      <span style={{ color: '#6b7280', fontSize: '0.875rem', fontWeight: 400 }}>
                        {' '}
                        / ay
                      </span>
                    </p>
                    <p style={{ color: '#6b7280', fontSize: '0.8125rem' }}>
                      Yıllık:{' '}
                      <TrCurrency
                        amount={plan.yearlyPriceKurus}
                        currency={plan.currency as 'TRY' | 'USD' | 'EUR' | 'GBP'}
                      />
                    </p>
                  </div>

                  <ul
                    style={{
                      marginTop: '1rem',
                      paddingLeft: '1.25rem',
                      color: '#374151',
                      fontSize: '0.875rem',
                      listStyle: 'none',
                    }}
                  >
                    <li>📅 {plan.trialDays} gün ücretsiz deneme</li>
                    <li>👥 {plan.maxUsers.toLocaleString('tr-TR')} kullanıcı</li>
                    <li>📦 {plan.maxProducts.toLocaleString('tr-TR')} ürün</li>
                    <li>🛒 {plan.maxOrdersPerMonth.toLocaleString('tr-TR')} sipariş/ay</li>
                    <li>💾 {formatStorage(plan.maxStorageBytes)} depolama</li>
                  </ul>
                </Card>
              ))
          )}
        </div>
      </div>
    </AdminShell>
  );
}
