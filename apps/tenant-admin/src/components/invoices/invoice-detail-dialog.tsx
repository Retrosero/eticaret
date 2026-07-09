'use client';

import { useState } from 'react';
import {
  Send,
  RefreshCw,
  XCircle,

  ExternalLink,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea, Label } from '@/components/ui/input';
import { apiClient, extractApiError } from '@/lib/api-client';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { Invoice } from '@/lib/api-types';

interface InvoiceDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: Invoice | null;
  onSuccess: () => void;
}

const INVOICE_STATUS_LABEL: Record<string, string> = {
  draft: 'Taslak',
  issued: 'Düzenlendi',
  cancelled: 'İptal',
  paid: 'Ödendi',
  overdue: 'Vadesi Geçti',
};

const E_STATUS_LABEL: Record<string, string> = {
  not_required: 'Gerekli Değil',
  pending: 'GİB\'e Gönderilecek',
  sent: 'GİB\'e Gönderildi',
  accepted: 'Kabul Edildi',
  rejected: 'Reddedildi',
  cancelled: 'İptal Edildi',
  failed: 'Gönderim Başarısız',
};

const E_STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'success' | 'warning' | 'outline'> = {
  not_required: 'outline',
  pending: 'warning',
  sent: 'default',
  accepted: 'success',
  rejected: 'destructive',
  cancelled: 'secondary',
  failed: 'destructive',
};

export function InvoiceDetailDialog({
  open,
  onOpenChange,
  invoice,
  onSuccess,
}: InvoiceDetailDialogProps) {
  const [isResending, setIsResending] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // İptal dialog state
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  if (!invoice) return null;

  const isEInvoice = invoice.invoiceType !== 'pdf';
  const eStatus = invoice.eInvoiceStatus ?? 'not_required';

  async function handleResend() {
    setIsResending(true);
    setError(null);
    setActionMessage(null);
    try {
      const { data } = await apiClient.post<{ status: string; errorMessage?: string }>(
        `/invoices/${invoice!.id}/resend`,
      );
      setActionMessage(`GİB'e gönderildi: ${E_STATUS_LABEL[data.status] ?? data.status}`);
      if (data.errorMessage) setActionMessage(`Hata: ${data.errorMessage}`);
      onSuccess();
    } catch (err) {
      setError(extractApiError(err));
    } finally {
      setIsResending(false);
    }
  }

  async function handleRefreshStatus() {
    setIsRefreshing(true);
    setError(null);
    setActionMessage(null);
    try {
      const { data } = await apiClient.post<{ status: string; gibReference?: string }>(
        `/invoices/${invoice!.id}/refresh-status`,
      );
      setActionMessage(`GİB durumu: ${E_STATUS_LABEL[data.status] ?? data.status}`);
      if (data.gibReference) {
        setActionMessage(`GİB durumu: ${E_STATUS_LABEL[data.status]} • Ref: ${data.gibReference}`);
      }
      onSuccess();
    } catch (err) {
      setError(extractApiError(err));
    } finally {
      setIsRefreshing(false);
    }
  }

  async function handleCancelConfirm() {
    if (!cancelReason.trim()) {
      setError('İptal gerekçesi zorunludur.');
      return;
    }
    setIsCancelling(true);
    setError(null);
    try {
      await apiClient.post(`/invoices/${invoice!.id}/cancel`, { reason: cancelReason });
      setCancelOpen(false);
      setActionMessage('Fatura iptal edildi');
      onSuccess();
      onOpenChange(false);
    } catch (err) {
      setError(extractApiError(err));
    } finally {
      setIsCancelling(false);
    }
  }

  const canResend =
    isEInvoice &&
    (eStatus === 'pending' || eStatus === 'failed' || eStatus === 'rejected');
  const canRefresh = isEInvoice && !!invoice.externalUuid;
  const canCancel =
    invoice.status !== 'cancelled' && eStatus !== 'cancelled' && eStatus !== 'accepted';

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={onOpenChange}
        title={`Fatura: ${invoice.invoiceNumber}`}
        description={`Sipariş ID: ${invoice.orderId.slice(0, 8)}…`}
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Kapat
            </Button>
            {canResend && (
              <Button onClick={handleResend} disabled={isResending}>
                <Send className="mr-1 h-4 w-4" />
                {isResending ? 'Gönderiliyor…' : 'GİB\'e Gönder'}
              </Button>
            )}
            {canRefresh && (
              <Button variant="outline" onClick={handleRefreshStatus} disabled={isRefreshing}>
                <RefreshCw className={`mr-1 h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                {isRefreshing ? 'Sorgulanıyor…' : 'GİB Durumunu Sorgula'}
              </Button>
            )}
          </>
        }
      >
        {error && (
          <div className="mb-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {actionMessage && (
          <div className="mb-3 rounded-md bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-800 flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{actionMessage}</span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">Fatura No:</span>
            <p className="font-medium">{invoice.invoiceNumber}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Tür:</span>
            <p className="font-medium">
              {invoice.invoiceType === 'pdf'
                ? 'PDF (Manuel)'
                : invoice.invoiceType === 'e_fatura'
                  ? 'e-Fatura'
                  : invoice.invoiceType === 'e_arsiv'
                    ? 'e-Arşiv'
                    : 'e-İrsaliye'}
            </p>
          </div>
          <div>
            <span className="text-muted-foreground">Durum:</span>
            <div className="mt-1">
              <Badge variant="outline">{INVOICE_STATUS_LABEL[invoice.status] ?? invoice.status}</Badge>
            </div>
          </div>
          <div>
            <span className="text-muted-foreground">Düzenleme Tarihi:</span>
            <p className="font-medium">{formatDate(invoice.issuedAt)}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Toplam Tutar:</span>
            <p className="text-lg font-semibold">{formatCurrency(invoice.totalAmount, invoice.currency)}</p>
          </div>
          <div>
            <span className="text-muted-foreground">KDV:</span>
            <p className="font-medium">{formatCurrency(invoice.taxTotal, invoice.currency)}</p>
          </div>
        </div>

        {/* e-Fatura detayları */}
        {isEInvoice && (
          <div className="mt-4 rounded-md border bg-muted/30 p-4 space-y-3">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <ExternalLink className="h-4 w-4" />
              e-Fatura / GİB Bilgileri
            </h4>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-muted-foreground">GİB Durumu:</span>
                <div className="mt-1">
                  <Badge variant={E_STATUS_VARIANT[eStatus] ?? 'outline'}>
                    {E_STATUS_LABEL[eStatus] ?? eStatus}
                  </Badge>
                </div>
              </div>
              <div>
                <span className="text-muted-foreground">Adaptör:</span>
                <p className="font-medium">{invoice.eFaturaProvider ?? '—'}</p>
              </div>
              <div className="col-span-2">
                <span className="text-muted-foreground">GİB UUID:</span>
                <p className="font-mono text-xs mt-1 break-all bg-background px-2 py-1 rounded">
                  {invoice.externalUuid ?? 'Henüz atanmadı'}
                </p>
              </div>
            </div>

            {eStatus === 'failed' && (
              <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>
                  GİB'e gönderim başarısız oldu. "GİB'e Gönder" butonu ile yeniden deneyin.
                </span>
              </div>
            )}
            {eStatus === 'rejected' && (
              <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>
                  Fatura GİB tarafından reddedildi. Yeni bir fatura oluşturmanız gerekebilir.
                </span>
              </div>
            )}
          </div>
        )}

        {/* İptal Butonu */}
        {canCancel && (
          <div className="mt-4 pt-4 border-t">
            <Button
              variant="destructive"
              size="sm"
              onClick={() => setCancelOpen(true)}
            >
              <XCircle className="mr-1 h-4 w-4" />
              Faturayı İptal Et
            </Button>
            <p className="mt-2 text-xs text-muted-foreground">
              e-Fatura ise iptal GİB'e de bildirilir. e-Arşiv için yeni bir iade faturası oluşturmanız
              gerekebilir.
            </p>
          </div>
        )}
      </Dialog>

      {/* İptal Onay Dialog */}
      <Dialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Faturayı İptal Et"
        description={invoice.invoiceNumber}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setCancelOpen(false)} disabled={isCancelling}>
              Vazgeç
            </Button>
            <Button variant="destructive" onClick={handleCancelConfirm} disabled={isCancelling}>
              {isCancelling ? 'İptal Ediliyor…' : 'Evet, İptal Et'}
            </Button>
          </>
        }
      >
        <div className="space-y-2">
          <Label htmlFor="cancel-reason">
            İptal Gerekçesi <span className="text-destructive">*</span>
          </Label>
          <Textarea
            id="cancel-reason"
            rows={3}
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            placeholder="Örn: Müşteri talebi, yanlış tutar..."
            required
          />
        </div>
      </Dialog>
    </>
  );
}