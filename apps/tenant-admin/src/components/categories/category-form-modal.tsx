'use client';

import { useEffect, useState } from 'react';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { apiClient, extractApiError } from '@/lib/api-client';
import type { Category } from '@/lib/api-types';

interface CategoryFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category?: Category | null;
  /** Mevcut kategoriler — üst kategori seçimi için. */
  categories: Category[];
  onSuccess: () => void;
}

export function CategoryFormModal({
  open,
  onOpenChange,
  category,
  categories,
  onSuccess,
}: CategoryFormModalProps) {
  const isEdit = !!category;
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [parentId, setParentId] = useState('');
  const [position, setPosition] = useState('0');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (category) {
      setName(category.name);
      setSlug(category.slug);
      setParentId(category.parentId ?? '');
      setPosition(String(category.position));
    } else {
      setName('');
      setSlug('');
      setParentId('');
      setPosition('0');
    }
  }, [open, category]);

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

  // Üst kategori olarak kendisi ve alt kategorileri seçilemez (döngü engeli)
  const parentOptions = categories.filter((c) => c.id !== category?.id);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name || !slug) {
      setError('İsim ve slug zorunludur.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const body = {
        name,
        slug,
        parentId: parentId || null,
        position: parseInt(position, 10) || 0,
      };
      if (isEdit && category) {
        await apiClient.put(`/categories/${category.id}`, body);
      } else {
        await apiClient.post('/categories', body);
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
      title={isEdit ? 'Kategoriyi Düzenle' : 'Yeni Kategori'}
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
          <Label htmlFor="cat-name">
            Kategori Adı <span className="text-destructive">*</span>
          </Label>
          <Input
            id="cat-name"
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
          <Label htmlFor="cat-slug">
            Slug <span className="text-destructive">*</span>
          </Label>
          <Input id="cat-slug" value={slug} onChange={(e) => setSlug(e.target.value)} required />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="cat-parent">Üst Kategori</Label>
            <Select
              id="cat-parent"
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
              options={[
                { value: '', label: '— Yok (Ana Kategori) —' },
                ...parentOptions.map((c) => ({ value: c.id, label: c.name })),
              ]}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cat-position">Sıra</Label>
            <Input
              id="cat-position"
              type="number"
              min="0"
              value={position}
              onChange={(e) => setPosition(e.target.value)}
            />
          </div>
        </div>
      </form>
    </Dialog>
  );
}