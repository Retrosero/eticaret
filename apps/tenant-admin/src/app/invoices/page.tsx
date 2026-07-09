'use client';

import { useEffect, useState } from 'react';
import { Plus, FileText, Eye, Search } from 'lucide-react';
import { DashboardLayout } from '@/components/dashboard-layout';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Dialog } from '@/components/ui/dialog';
import { Select } from '@/components/ui/select';
import { Label } from '@/components/ui/input';
import { apiClient, extractApiError } from '@/lib/api-client';
import { formatCurrency, formatDateShort } from '@/lib/utils';
import type { Invoice, Order } from '@/lib/api-types';
import { InvoiceDetailDialog } from '@/components/invoices/invoice-detail-dialog';

const INVOICE_TYPE_LABEL: Record<string, string> = {
  pdf: 'PDF',
  e_fatura: 'e-Fatura',
  e_arsiv: 'e-Arşiv',
  e_irsaliye: 'e-İrsaliye',
};

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'success' | 'warning' | 'outline'> = {
  draft: 'outline',
  issued: 'default',
  cancelled: 'secondary',
  paid: 'success',
  overdue: 'warning',
};

const STATUS_LABEL: Record<string, string> = {
  draft: 'Taslak',
  issued: 'Düzenlendi',
  cancelled: 'İptal',
  paid: 'Ödendi',
  overdue: 'Vadesi Geçti',
};

const E_STATUS_LABEL: Record<string, string> = {
  not_required: '—',
  pending: 'Bekliyor',
  sent: 'Gönderildi',
  accepted: 'Kabul',
  rejected: 'Red',
  cancelled: 'İptal',
  failed: 'Hata',
};

function InvoicesContent() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');

  const [viewTarget, setViewTarget] = useState<Invoice | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  async function load() {
    try {
      setIsLoading(true);
      const { data } = await apiClient.get('/invoices', {
        params: {
          q: search || undefined,
          invoiceType: typeFilter || undefined,
          status: statusFilter || undefined,
        },
      });
      setInvoices((data as any).items ?? data ?? []);
    } catch (err) {
      setError(extractApiError(err));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [typeFilter, statusFilter]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Faturalar</h2>
          <p className="text-sm text-muted-foreground">
            e-Fatura, e-Arşiv ve manuel PDF faturalar — toplam {invoices.length}
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Yeni Fatura
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Fatura ara…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') load();
                }}
                className="pl-10"
              />
            </div>

            <select
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
            >
              <option value="">Tüm Türler</option>
              <option value="e_fatura">e-Fatura</option>
              <option value="e_arsiv">e-Arşiv</option>
              <option value="e_irsaliye">e-İrsaliye</option>
              <option value="pdf">PDF (Manuel)</option>
            </select>

            <select
              className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">Tüm Durumlar</option>
              <option value="issued">Düzenlendi</option>
              <option value="paid">Ödendi</option>
              <option value="cancelled">İptal</option>
              <option value="overdue">Vadesi Geçti</option>
            </select>
          </div>
        </CardHeader>
        <CardContent>
          {error && !isLoading ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : isLoading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Yükleniyor…</p>
          ) : invoices.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <FileText className="h-12 w-12 text-muted-foreground/40 mb-4" />
              <p className="text-sm text-muted-foreground">Henüz fatura yok.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fatura No</TableHead>
                  <TableHead>Tür</TableHead>
                  <TableHead>Durum</TableHead>
                  <TableHead>GİB</TableHead>
                  <TableHead>Tutar</TableHead>
                  <TableHead>Tarih</TableHead>
                  <TableHead className="text-right">İşlem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell>
                      <p className="font-medium">{inv.invoiceNumber}</p>
                      <p className="text-xs text-muted-foreground font-mono">
                        {inv.id.slice(0, 8)}…
                      </p>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{INVOICE_TYPE_LABEL[inv.invoiceType] ?? inv.invoiceType}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[inv.status] ?? 'outline'}>
                        {STATUS_LABEL[inv.status] ?? inv.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {inv.invoiceType !== 'pdf' ? (
                        <Badge
                          variant={
                            inv.eInvoiceStatus === 'accepted'
                              ? 'success'
                              : inv.eInvoiceStatus === 'failed' || inv.eInvoiceStatus === 'rejected'
                                ? 'destructive'
                                : 'outline'
                          }
                        >
                          {E_STATUS_LABEL[inv.eInvoiceStatus ?? 'not_required']}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="font-medium">
                      {formatCurrency(inv.totalAmount, inv.currency)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDateShort(inv.issuedAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => setViewTarget(inv)} aria-label="Detay">
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Detay Dialog */}
      <InvoiceDetailDialog
        open={!!viewTarget}
        onOpenChange={(o) => !o && setViewTarget(null)}
        invoice={viewTarget}
        onSuccess={load}
      />

      {/* Yeni Fatura Dialog */}
      <CreateInvoiceDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSuccess={() => {
          setCreateOpen(false);
          load();
        }}
      />
    </div>
  );
}

/**
 * Yeni fatura oluşturma dialog'u — mevcut bir sipariş için fatura oluşturur.
 */
function CreateInvoiceDialog({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [invoiceType, setInvoiceType] = useState<'pdf' | 'e_fatura' | 'e_arsiv' | 'e_irsaliye'>('e_fatura');
  const [customerTaxId, setCustomerTaxId] = useState('');
  const [customerCompanyName, setCustomerCompanyName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Dialog açıldığında faturalandırılmamış siparişleri çek
  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        setIsLoading(true);
        const { data } = await apiClient.get('/orders', {
          params: { page: 1, pageSize: 50, status: 'delivered' },
        });
        setOrders((data as any).items ?? []);
      } catch (err) {
        setError(extractApiError(err));
      } finally {
        setIsLoading(false);
      }
    })();
  }, [open]);

  async function handleSubmit() {
    if (!selectedOrderId) {
      setError('Sipariş seçilmedi.');
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      await apiClient.post('/invoices', {
        orderId: selectedOrderId,
        type: invoiceType,
        customerTaxId: customerTaxId || null,
        customerCompanyName: customerCompanyName || null,
      });
      onSuccess();
    } catch (err) {
      setError(extractApiError(err));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Yeni Fatura Oluştur"
      description="Teslim edilmiş bir sipariş için fatura kesin"
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            İptal
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting || isLoading || !selectedOrderId}>
            {isSubmitting ? 'Oluşturuluyor…' : 'Fatura Oluştur'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && (
          <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>
        )}

        <div className="space-y-2">
          <Label htmlFor="order-select">Sipariş</Label>
          <select
            id="order-select"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={selectedOrderId}
            onChange={(e) => setSelectedOrderId(e.target.value)}
          >
            <option value="">— Sipariş seçin —</option>
            {orders.map((o) => (
              <option key={o.id} value={o.id}>
                {o.orderNumber} • {o.customerEmail ?? 'Misafir'} • {formatCurrency(o.grandTotal, o.currency)}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label>Fatura Türü</Label>
          <Select
            value={invoiceType}
            onChange={(e) => setInvoiceType(e.target.value as typeof invoiceType)}
            options={[
              { value: 'e_fatura', label: 'e-Fatura (GİB entegrasyonlu)' },
              { value: 'e_arsiv', label: 'e-Arşiv (GİB entegrasyonlu)' },
              { value: 'pdf', label: 'PDF (Manuel)' },
            ]}
          />
          {invoiceType === 'e_fatura' && (
            <p className="text-xs text-muted-foreground">
              ⚠️ e-Fatura için alıcının VKN'si zorunludur.
            </p>
          )}
        </div>

        {invoiceType !== 'pdf' && (
          <>
            <div className="space-y-2">
              <Label htmlFor="tax-id">Müşteri VKN/TCKN</Label>
              <Input
                id="tax-id"
                value={customerTaxId}
                onChange={(e) => setCustomerTaxId(e.target.value)}
                placeholder="1234567890"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="company-name">Müşteri Firma Adı</Label>
              <Input
                id="company-name"
                value={customerCompanyName}
                onChange={(e) => setCustomerCompanyName(e.target.value)}
                placeholder="Firma Ltd. Şti."
              />
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}

export default function InvoicesPage() {
  return (
    <DashboardLayout>
      <InvoicesContent />
    </DashboardLayout>
  );
}