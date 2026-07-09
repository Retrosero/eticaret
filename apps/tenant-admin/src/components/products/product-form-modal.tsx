'use client';

import { useEffect, useState } from 'react';
import { Trash2, Plus } from 'lucide-react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input, Textarea, Label } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { apiClient, extractApiError } from '@/lib/api-client';
import type { Product, ProductVariant, Brand, Category } from '@/lib/api-types';

interface ProductFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Düzenleme için mevcut ürün. Create için undefined. */
  product?: Product | null;
  onSuccess: () => void;
}

interface VariantFormState {
  id?: string;
  sku: string;
  name: string;
  priceAmount: string;
  stockQty: string;
  isDefault: boolean;
  barcode?: string;
}

const EMPTY_VARIANT: VariantFormState = {
  sku: '',
  name: '',
  priceAmount: '0',
  stockQty: '0',
  isDefault: true,
};

export function ProductFormModal({
  open,
  onOpenChange,
  product,
  onSuccess,
}: ProductFormModalProps) {
  const isEdit = !!product;

  // Form state
  const [slug, setSlug] = useState('');
  const [title, setTitle] = useState('');
  const [shortDescription, setShortDescription] = useState('');
  const [longDescription, setLongDescription] = useState('');
  const [status, setStatus] = useState<'draft' | 'active' | 'archived'>('draft');
  const [brandId, setBrandId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [variants, setVariants] = useState<VariantFormState[]>([EMPTY_VARIANT]);

  const [brands, setBrands] = useState<Brand[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Açıldığında form'u doldur
  useEffect(() => {
    if (!open) return;
    setError(null);

    if (product) {
      setSlug(product.slug);
      setTitle(product.title);
      setShortDescription(product.shortDescription ?? '');
      setLongDescription(product.longDescription ?? '');
      setStatus(product.status);
      setBrandId(product.brandId ?? '');
      setCategoryId(product.categoryId ?? '');

      // Varyantları çek
      (async () => {
        try {
          setIsLoading(true);
          const { data } = await apiClient.get(`/products/${product.id}/variants`);
          const list = (data as any).items ?? data ?? [];
          if (list.length > 0) {
            setVariants(
              list.map((v: ProductVariant) => ({
                id: v.id,
                sku: v.sku,
                name: v.name,
                priceAmount: v.priceAmount,
                stockQty: String(v.stockQty),
                isDefault: v.isDefault,
                barcode: v.barcode ?? undefined,
              })),
            );
          } else {
            setVariants([EMPTY_VARIANT]);
          }
        } catch {
          setVariants([EMPTY_VARIANT]);
        } finally {
          setIsLoading(false);
        }
      })();
    } else {
      // Reset
      setSlug('');
      setTitle('');
      setShortDescription('');
      setLongDescription('');
      setStatus('draft');
      setBrandId('');
      setCategoryId('');
      setVariants([EMPTY_VARIANT]);
    }
  }, [open, product]);

  // Marka/kategori listelerini yükle
  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const [bRes, cRes] = await Promise.allSettled([
          apiClient.get('/brands'),
          apiClient.get('/categories'),
        ]);
        setBrands(bRes.status === 'fulfilled' ? ((bRes.value.data as any).items ?? bRes.value.data ?? []) : []);
        setCategories(
          cRes.status === 'fulfilled' ? ((cRes.value.data as any).items ?? cRes.value.data ?? []) : [],
        );
      } catch {
        // sessizce devam et
      }
    })();
  }, [open]);

  function generateSlug(text: string): string {
    return text
      .toLowerCase()
      .replace(/ı/g, 'i')
      .replace(/ş/g, 's')
      .replace(/ğ/g, 'g')
      .replace(/ü/g, 'u')
      .replace(/ö/g, 'o')
      .replace(/ç/g, 'c')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  function handleTitleChange(value: string) {
    setTitle(value);
    if (!isEdit && !slug) {
      setSlug(generateSlug(value));
    }
  }

  function addVariant() {
    setVariants([...variants, { ...EMPTY_VARIANT, isDefault: false }]);
  }

  function removeVariant(idx: number) {
    setVariants(variants.filter((_, i) => i !== idx));
  }

  function updateVariant(idx: number, patch: Partial<VariantFormState>) {
    setVariants(variants.map((v, i) => (i === idx ? { ...v, ...patch } : v)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title || !slug) {
      setError('Başlık ve slug zorunludur.');
      return;
    }
    if (variants.length === 0 || variants.some((v) => !v.sku || !v.name)) {
      setError('En az bir varyant gerekli (SKU ve ad zorunlu).');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const body = {
        slug,
        title,
        shortDescription: shortDescription || null,
        longDescription: longDescription || null,
        status,
        brandId: brandId || null,
        categoryId: categoryId || null,
        variants: variants.map((v) => ({
          id: v.id,
          sku: v.sku,
          name: v.name,
          priceAmount: parseFloat(v.priceAmount),
          stockQty: parseInt(v.stockQty, 10),
          isDefault: v.isDefault,
          barcode: v.barcode || null,
        })),
      };

      if (isEdit && product) {
        await apiClient.put(`/products/${product.id}`, body);
      } else {
        await apiClient.post('/products', body);
      }

      onSuccess();
      onOpenChange(false);
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
      title={isEdit ? 'Ürünü Düzenle' : 'Yeni Ürün Ekle'}
      description={isEdit ? `${product?.title} ürününü düzenleyin.` : 'Yeni bir ürün oluşturun.'}
      size="xl"
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            İptal
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting || isLoading}>
            {isSubmitting ? 'Kaydediliyor…' : isEdit ? 'Güncelle' : 'Oluştur'}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Temel Bilgiler */}
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Temel Bilgiler
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="title">
                Başlık <span className="text-destructive">*</span>
              </Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => handleTitleChange(e.target.value)}
                placeholder="Ürün adı"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="slug">
                Slug <span className="text-destructive">*</span>
              </Label>
              <Input
                id="slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="urun-adi"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="shortDescription">Kısa Açıklama</Label>
            <Input
              id="shortDescription"
              value={shortDescription}
              onChange={(e) => setShortDescription(e.target.value)}
              placeholder="Ürün kartında görünecek kısa açıklama"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="longDescription">Uzun Açıklama</Label>
            <Textarea
              id="longDescription"
              value={longDescription}
              onChange={(e) => setLongDescription(e.target.value)}
              placeholder="Detaylı ürün açıklaması"
              rows={4}
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="status">Durum</Label>
              <Select
                id="status"
                value={status}
                onChange={(e) => setStatus(e.target.value as typeof status)}
                options={[
                  { value: 'draft', label: 'Taslak' },
                  { value: 'active', label: 'Yayında' },
                  { value: 'archived', label: 'Arşivlendi' },
                ]}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="brand">Marka</Label>
              <Select
                id="brand"
                value={brandId}
                onChange={(e) => setBrandId(e.target.value)}
                options={[
                  { value: '', label: '— Seçiniz —' },
                  ...brands.map((b) => ({ value: b.id, label: b.name })),
                ]}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="category">Kategori</Label>
              <Select
                id="category"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                options={[
                  { value: '', label: '— Seçiniz —' },
                  ...categories.map((c) => ({ value: c.id, label: c.name })),
                ]}
              />
            </div>
          </div>
        </div>

        {/* Varyantlar */}
        <div className="space-y-3 border-t pt-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Varyantlar
            </h3>
            <Button type="button" variant="outline" size="sm" onClick={addVariant}>
              <Plus className="mr-1 h-3 w-3" />
              Varyant Ekle
            </Button>
          </div>

          {variants.map((v, idx) => (
            <div key={idx} className="rounded-md border p-3 space-y-3 bg-muted/20">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Varyant #{idx + 1}</p>
                {variants.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeVariant(idx)}
                    aria-label="Varyantı sil"
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-12 gap-3">
                <div className="col-span-3 space-y-1">
                  <Label className="text-xs">SKU *</Label>
                  <Input
                    value={v.sku}
                    onChange={(e) => updateVariant(idx, { sku: e.target.value })}
                    placeholder="SKU-001"
                    required
                  />
                </div>
                <div className="col-span-4 space-y-1">
                  <Label className="text-xs">Varyant Adı *</Label>
                  <Input
                    value={v.name}
                    onChange={(e) => updateVariant(idx, { name: e.target.value })}
                    placeholder="Beden: M, Renk: Kırmızı"
                    required
                  />
                </div>
                <div className="col-span-2 space-y-1">
                  <Label className="text-xs">Fiyat (TRY) *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={v.priceAmount}
                    onChange={(e) => updateVariant(idx, { priceAmount: e.target.value })}
                    required
                  />
                </div>
                <div className="col-span-2 space-y-1">
                  <Label className="text-xs">Stok</Label>
                  <Input
                    type="number"
                    min="0"
                    value={v.stockQty}
                    onChange={(e) => updateVariant(idx, { stockQty: e.target.value })}
                  />
                </div>
                <div className="col-span-1 flex items-end">
                  <label className="flex items-center gap-1 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={v.isDefault}
                      onChange={(e) => updateVariant(idx, { isDefault: e.target.checked })}
                      className="h-4 w-4"
                    />
                    Varsayılan
                  </label>
                </div>
              </div>
            </div>
          ))}
        </div>
      </form>
    </Dialog>
  );
}