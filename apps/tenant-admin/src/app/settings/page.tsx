'use client';

import { DashboardLayout } from '@/components/dashboard-layout';
import { SettingsClient } from './SettingsClient';

export default function SettingsPage() {
  return (
    <DashboardLayout>
      <SettingsClient />
    </DashboardLayout>
  );
}
