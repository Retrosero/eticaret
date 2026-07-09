'use client';

import { useState } from 'react';
import { CheckCircle2, XCircle, Truck, Package, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea, Label } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Dialog, ConfirmDialog } from '@/components/ui/dialog';
import { apiClient, extractApiError } from '@/lib/api-client';
import { type OrderStatus } from '@/lib/api-types';
import { ORDER_STATUS_LABEL } from '@/lib/utils';

/**
 * ALLOWED_TRANSITIONS — backend'deki sıralı geçiş makinesinin frontend aynağı.
 * Bu liste backend'den dinamik çekilebilir; şimdilik manuel.
 */
const NEXT_STATUSES: Record<OrderStatus, OrderStatus[]> = {
  pending: ['pending_payment', 'cancelled'],
  pending_payment: ['awaiting_payment', 'cancelled', 'failed'],
  awaiting_payment: ['confirmed', 'cancelled', 'failed'],
  paid: ['confirmed', 'preparing', 'cancelled'],
  confirmed: ['preparing', 'cancelled'],
  preparing: ['shipped', 'cancelled'],
  partially_shipped: ['shipped', 'cancelled'],
  shipped: ['delivered', 'returned'],
  delivered: ['returned', 'closed'],
  returned: ['refunded'],
  refunded: ['closed'],
  cancelled: ['closed'],
  failed: ['closed'],
  closed: [],
  on_hold: ['confirmed', 'cancelled'],
};

interface OrderStatusActionsProps {
  orderId: string;
  currentStatus: OrderStatus;
  onSuccess: () => void;
}

export function OrderStatusActions({
  orderId,
  currentStatus,
  onSuccess,
}: OrderStatusActionsProps) {
  const [transitionOpen, setTransitionOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);

  const allowedNext = NEXT_STATUSES[currentStatus] ?? [];

  const [selectedStatus, setSelectedStatus] = useState<OrderStatus | ''>('');
  const [note, setNote] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openTransitionDialog(status: OrderStatus) {
    setSelectedStatus(status);
    setNote('');
    setError(null);
    setTransitionOpen(true);
  }

  async function handleTransition() {
    if (!selectedStatus) return;
    setIsLoading(true);
    setError(null);

    try {
      await apiClient.post(`/orders/${orderId}/transition`, {
        toStatus: selectedStatus,
        reason: note || undefined,
      });
      setTransitionOpen(false);
      onSuccess();
    } catch (err) {
      setError(extractApiError(err));
    } finally {
      setIsLoading(false);
    }
  }

  async function handleCancel() {
    setIsLoading(true);
    setError(null);
    try {
      await apiClient.post(`/orders/${orderId}/cancel`, { reason: note || 'Admin tarafından iptal' });
      setCancelOpen(false);
      onSuccess();
    } catch (err) {
      setError(extractApiError(err));
    } finally {
      setIsLoading(false);
    }
  }

  async function handleReturn() {
    setIsLoading(true);
    setError(null);
    try {
      await apiClient.post(`/orders/${orderId}/return`, { reason: note || 'İade talebi' });
      setReturnOpen(false);
      onSuccess();
    } catch (err) {
      setError(extractApiError(err));
    } finally {
      setIsLoading(false);
    }
  }

  // Belirli eylemler için kısayollar
  const canCancel = !['cancelled', 'closed', 'delivered', 'returned', 'refunded'].includes(currentStatus);
  const canReturn = ['delivered', 'shipped'].includes(currentStatus);

  if (allowedNext.length === 0 && !canCancel && !canReturn) {
    return (
      <p className="text-sm text-muted-foreground">
        Bu sipariş için başka işlem yapılamaz ({ORDER_STATUS_LABEL[currentStatus] ?? currentStatus}).
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {/* Hızlı Geçiş Butonları */}
        {allowedNext.map((next) => {
          const isCancel = next === 'cancelled';
          const isShip = next === 'shipped';
          const isDeliver = next === 'delivered';
          const isPrepare = next === 'preparing';

          return (
            <Button
              key={next}
              variant={isCancel ? 'destructive' : 'default'}
              size="sm"
              onClick={() => openTransitionDialog(next)}
            >
              {isPrepare && <Package className="mr-1 h-3 w-3" />}
              {isShip && <Truck className="mr-1 h-3 w-3" />}
              {isDeliver && <CheckCircle2 className="mr-1 h-3 w-3" />}
              {ORDER_STATUS_LABEL[next] ?? next}
            </Button>
          );
        })}

        {canCancel && (
          <Button variant="destructive" size="sm" onClick={() => setCancelOpen(true)}>
            <XCircle className="mr-1 h-3 w-3" />
            İptal Et
          </Button>
        )}

        {canReturn && (
          <Button variant="outline" size="sm" onClick={() => setReturnOpen(true)}>
            <RotateCcw className="mr-1 h-3 w-3" />
            İade Başlat
          </Button>
        )}
      </div>

      {/* Geçiş Onay Dialog */}
      <Dialog
        open={transitionOpen}
        onOpenChange={setTransitionOpen}
        title="Sipariş Durumunu Güncelle"
        description={`Mevcut: ${ORDER_STATUS_LABEL[currentStatus] ?? currentStatus}`}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setTransitionOpen(false)} disabled={isLoading}>
              Vazgeç
            </Button>
            <Button onClick={handleTransition} disabled={isLoading || !selectedStatus}>
              {isLoading ? 'Güncelleniyor…' : 'Güncelle'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {error && (
            <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="space-y-2">
            <Label>Yeni Durum</Label>
            <Select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value as OrderStatus)}
              options={allowedNext.map((s) => ({ value: s, label: ORDER_STATUS_LABEL[s] ?? s }))}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="note">Not (opsiyonel)</Label>
            <Textarea
              id="note"
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Bu geçiş için bir not ekleyin..."
            />
          </div>
        </div>
      </Dialog>

      {/* İptal Onay */}
      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Siparişi İptal Et"
        description="Bu sipariş iptal edilecek. Müşteriye bildirim gönderilecek ve varsa ön provizyon iptal edilecek."
        confirmText="Evet, İptal Et"
        variant="destructive"
        onConfirm={handleCancel}
        isLoading={isLoading}
      />

      {/* İade Onay */}
      <ConfirmDialog
        open={returnOpen}
        onOpenChange={setReturnOpen}
        title="İade Süreci Başlat"
        description="İade talebi oluşturulacak. Müşteri ürünü gönderecek ve onay sonrası iade ödemesi yapılacak."
        confirmText="İade Başlat"
        onConfirm={handleReturn}
        isLoading={isLoading}
      />
    </div>
  );
}