'use client';

import { useState } from 'react';
import { ConfirmDialog } from '@/components/ui/dialog';
import { apiClient, extractApiError } from '@/lib/api-client';
import type { Product } from '@/lib/api-types';

interface DeleteProductDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: Product | null;
  onSuccess: () => void;
}

export function DeleteProductDialog({
  open,
  onOpenChange,
  product,
  onSuccess,
}: DeleteProductDialogProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    if (!product) return;
    setIsLoading(true);
    setError(null);

    try {
      await apiClient.delete(`/products/${product.id}`);
      onSuccess();
      onOpenChange(false);
    } catch (err) {
      setError(extractApiError(err));
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Ürünü Silmek İstediğinize Emin Misiniz?"
      description={
        error
          ? error
          : `"${product?.title}" ürünü arşivlenecek. Geçmiş siparişlerde kullanılan veriler korunur. Bu işlem geri alınamaz.`
      }
      confirmText="Evet, Sil"
      cancelText="Vazgeç"
      variant="destructive"
      onConfirm={handleConfirm}
      isLoading={isLoading}
    />
  );
}