'use client';

import { useEffect, useState } from 'react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input, Textarea, Label } from '@/components/ui/input';
import { apiClient, extractApiError } from '@/lib/api-client';
import type { Brand } from '@/lib/api-types';

interface BrandFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brand?: Brand | null;
  onSuccess: () => void;
}

export function BrandFormModal({ open, onOpenChange, brand, onSuccess }: BrandFormModalProps) {
  const isEdit = !!brand;
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (brand) {
      setName(brand.name);
      setSlug(brand.slug);
      setDescription(brand.description ?? '');
    } else {
      setName('');
      setSlug('');
      setDescription('');
    }
  }, [open, brand]);

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name || !slug) {
      setError('İsim ve slug zorunludur.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const body = { name, slug, description: description || null };
      if (isEdit && brand) {
        await apiClient.put(`/brands/${brand.id}`, body);
      } else {
        await apiClient.post('/brands', body);
      }
      onSuccess();
      onOpenChange(false);
    } catch (err) {
      setError(extractApiError(err));
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={isEdit ? 'Markayı Düzenle' : 'Yeni Marka'}
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            İptal
          </Button>
          <Button onClick={handleSubmit} disabled={isLoading}>
            {isLoading ? 'Kaydediliyor…' : isEdit ? 'Güncelle' : 'Oluştur'}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="brand-name">
            Marka Adı <span className="text-destructive">*</span>
          </Label>
          <Input
            id="brand-name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (!isEdit && !slug) {
                setSlug(generateSlug(e.target.value));
              }
            }}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="brand-slug">
            Slug <span className="text-destructive">*</span>
          </Label>
          <Input id="brand-slug" value={slug} onChange={(e) => setSlug(e.target.value)} required />
        </div>

        <div className="space-y-2">
          <Label htmlFor="brand-desc">Açıklama</Label>
          <Textarea
            id="brand-desc"
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
      </form>
    </Dialog>
  );
}