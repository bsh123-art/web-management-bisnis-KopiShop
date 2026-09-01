'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Coffee, Download, Pencil, Plus, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { exportToExcel } from '@/lib/export';
import { formatCurrency, formatPercent, toISODate } from '@/lib/utils';
import type { Category, Ingredient, PageMeta, Product } from '@/lib/types';
import { Badge, Button, Field, Input, Select, Textarea } from '@/components/ui';
import { Column, DataTable, PageHeader, SearchInput } from '@/components/data-table';
import { ConfirmDialog, Modal } from '@/components/modal';

interface RecipeDraft {
  ingredientId: string;
  quantity: number;
}

interface VariantDraft {
  id?: string;
  name: string;
  priceDelta: number;
  recipeMultiplier: number;
}

interface ProductDraft {
  sku: string;
  barcode: string;
  name: string;
  description: string;
  categoryId: string;
  basePrice: number;
  baseCost: number;
  isActive: boolean;
  isFavorite: boolean;
  trackRecipe: boolean;
  recipe: RecipeDraft[];
  variants: VariantDraft[];
}

const emptyDraft = (categoryId = ''): ProductDraft => ({
  sku: '',
  barcode: '',
  name: '',
  description: '',
  categoryId,
  basePrice: 0,
  baseCost: 0,
  isActive: true,
  isFavorite: false,
  trackRecipe: true,
  recipe: [],
  variants: [],
});

export default function ProductsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<{ id?: string; draft: ProductDraft } | null>(null);
  const [deleting, setDeleting] = useState<Product | null>(null);

  const productsQuery = useQuery({
    queryKey: ['products', { search, categoryId, page }],
    queryFn: async () => {
      const response = await api.get<Product[]>('/catalog/products', { search, categoryId, page, pageSize: 20 });
      return { items: response.data, meta: response.meta as PageMeta };
    },
  });

  const categoriesQuery = useQuery({
    queryKey: ['categories'],
    queryFn: async () => (await api.get<Category[]>('/catalog/categories')).data,
    staleTime: 5 * 60_000,
  });

  const ingredientsQuery = useQuery({
    queryKey: ['ingredients', 'all'],
    queryFn: async () => (await api.get<Ingredient[]>('/inventory/ingredients', { pageSize: 200 })).data,
    staleTime: 5 * 60_000,
  });

  const save = useMutation({
    mutationFn: async ({ id, draft }: { id?: string; draft: ProductDraft }) => {
      const payload = {
        ...draft,
        barcode: draft.barcode || null,
        description: draft.description || null,
        recipe: draft.recipe.filter((line) => line.ingredientId && line.quantity > 0),
        variants: draft.variants.filter((variant) => variant.name.trim()),
      };
      return id ? api.patch(`/catalog/products/${id}`, payload) : api.post('/catalog/products', payload);
    },
    onSuccess: () => {
      toast.success(editing?.id ? 'Product updated' : 'Product created');
      setEditing(null);
      void queryClient.invalidateQueries({ queryKey: ['products'] });
      void queryClient.invalidateQueries({ queryKey: ['pos-catalog'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const archive = useMutation({
    mutationFn: (id: string) => api.delete(`/catalog/products/${id}`),
    onSuccess: () => {
      toast.success('Product archived');
      setDeleting(null);
      void queryClient.invalidateQueries({ queryKey: ['products'] });
      void queryClient.invalidateQueries({ queryKey: ['pos-catalog'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const columns: Column<Product>[] = [
    {
      key: 'name',
      header: 'Product',
      render: (row) => (
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: row.category.color }} />
            <span className="truncate font-medium">{row.name}</span>
            {row.isFavorite && <Badge tone="warning">Favourite</Badge>}
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {row.sku} · {row.category.name}
            {row.recipe.length > 0 && ` · ${row.recipe.length} ingredients`}
          </p>
        </div>
      ),
    },
    { key: 'price', header: 'Price', align: 'right', render: (row) => formatCurrency(row.basePrice) },
    {
      key: 'cost',
      header: 'Cost',
      align: 'right',
      hideBelow: 'md',
      render: (row) => <span className="text-muted-foreground">{formatCurrency(row.costPrice)}</span>,
    },
    {
      key: 'margin',
      header: 'Margin',
      align: 'right',
      hideBelow: 'sm',
      render: (row) => (
        <span className={row.marginPercent >= 50 ? 'text-success' : row.marginPercent >= 25 ? '' : 'text-warning'}>
          {formatPercent(row.marginPercent)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      align: 'center',
      hideBelow: 'lg',
      render: (row) => <Badge tone={row.isActive ? 'success' : 'neutral'}>{row.isActive ? 'Active' : 'Inactive'}</Badge>,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (row) => (
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            aria-label={`Edit ${row.name}`}
            onClick={(e) => {
              e.stopPropagation();
              setEditing({
                id: row.id,
                draft: {
                  sku: row.sku,
                  barcode: row.barcode ?? '',
                  name: row.name,
                  description: row.description ?? '',
                  categoryId: row.categoryId,
                  basePrice: row.basePrice,
                  baseCost: row.baseCost,
                  isActive: row.isActive,
                  isFavorite: row.isFavorite,
                  trackRecipe: row.trackRecipe,
                  recipe: row.recipe.map((line) => ({ ingredientId: line.ingredientId, quantity: line.quantity })),
                  variants: row.variants.map((v) => ({
                    id: v.id,
                    name: v.name,
                    priceDelta: v.priceDelta,
                    recipeMultiplier: v.recipeMultiplier,
                  })),
                },
              });
            }}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
            aria-label={`Archive ${row.name}`}
            onClick={(e) => {
              e.stopPropagation();
              setDeleting(row);
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Products"
        description="Menu items, pricing and recipes"
        actions={
          <>
            <Button
              variant="outline"
              onClick={() =>
                exportToExcel(
                  productsQuery.data?.items ?? [],
                  [
                    { header: 'SKU', value: (p) => p.sku },
                    { header: 'Name', value: (p) => p.name },
                    { header: 'Category', value: (p) => p.category.name },
                    { header: 'Price', value: (p) => p.basePrice },
                    { header: 'Cost', value: (p) => p.costPrice },
                    { header: 'Margin %', value: (p) => p.marginPercent },
                    { header: 'Active', value: (p) => (p.isActive ? 'Yes' : 'No') },
                  ],
                  `products-${toISODate(new Date())}`,
                  'Products',
                )
              }
            >
              <Download className="h-4 w-4" />
              Export
            </Button>
            <Button onClick={() => setEditing({ draft: emptyDraft(categoriesQuery.data?.[0]?.id) })}>
              <Plus className="h-4 w-4" />
              New product
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap gap-2">
        <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search products…" className="min-w-[220px] flex-1" />
        <Select value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setPage(1); }} className="w-auto min-w-[160px]" aria-label="Filter by category">
          <option value="">All categories</option>
          {categoriesQuery.data?.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </Select>
      </div>

      <DataTable
        columns={columns}
        rows={productsQuery.data?.items ?? []}
        loading={productsQuery.isLoading}
        rowKey={(row) => row.id}
        meta={productsQuery.data?.meta}
        onPageChange={setPage}
        emptyIcon={Coffee}
        emptyTitle="No products yet"
        emptyDescription="Create your first menu item to start selling."
      />

      {editing && (
        <ProductFormModal
          open
          draft={editing.draft}
          isEdit={!!editing.id}
          categories={categoriesQuery.data ?? []}
          ingredients={ingredientsQuery.data ?? []}
          saving={save.isPending}
          onClose={() => setEditing(null)}
          onChange={(draft) => setEditing({ ...editing, draft })}
          onSubmit={() => save.mutate(editing)}
        />
      )}

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && archive.mutate(deleting.id)}
        title="Archive product"
        message={`"${deleting?.name}" will be hidden from the POS. Past sales and reports are preserved.`}
        confirmLabel="Archive"
        destructive
        loading={archive.isPending}
      />
    </div>
  );
}

function ProductFormModal({
  open,
  draft,
  isEdit,
  categories,
  ingredients,
  saving,
  onClose,
  onChange,
  onSubmit,
}: {
  open: boolean;
  draft: ProductDraft;
  isEdit: boolean;
  categories: Category[];
  ingredients: Ingredient[];
  saving: boolean;
  onClose: () => void;
  onChange: (draft: ProductDraft) => void;
  onSubmit: () => void;
}) {
  const set = <K extends keyof ProductDraft>(key: K, value: ProductDraft[K]) => onChange({ ...draft, [key]: value });

  const recipeCost = draft.recipe.reduce((acc, line) => {
    const ingredient = ingredients.find((i) => i.id === line.ingredientId);
    return acc + (ingredient?.costPerUnit ?? 0) * line.quantity;
  }, 0);

  const effectiveCost = draft.trackRecipe && draft.recipe.length > 0 ? recipeCost : draft.baseCost;
  const margin = draft.basePrice > 0 ? ((draft.basePrice - effectiveCost) / draft.basePrice) * 100 : 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit product' : 'New product'}
      description="Recipes drive automatic ingredient deduction on every sale."
      size="xl"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={onSubmit} loading={saving} disabled={!draft.name || !draft.sku || !draft.categoryId}>
            {isEdit ? 'Save changes' : 'Create product'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name" required>
            <Input value={draft.name} onChange={(e) => set('name', e.target.value)} maxLength={120} autoFocus />
          </Field>
          <Field label="Category" required>
            <Select value={draft.categoryId} onChange={(e) => set('categoryId', e.target.value)}>
              <option value="">Select a category</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="SKU" required hint="Internal code, must be unique">
            <Input value={draft.sku} onChange={(e) => set('sku', e.target.value.toUpperCase())} maxLength={40} />
          </Field>
          <Field label="Barcode" hint="Optional — enables scanner checkout">
            <Input value={draft.barcode} onChange={(e) => set('barcode', e.target.value)} maxLength={64} />
          </Field>
          <Field label="Selling price" required>
            <Input type="number" min={0} value={draft.basePrice} onChange={(e) => set('basePrice', Number(e.target.value))} className="tabular" />
          </Field>
          <Field label="Fallback cost" hint="Used when the product has no recipe">
            <Input
              type="number"
              min={0}
              value={draft.baseCost}
              onChange={(e) => set('baseCost', Number(e.target.value))}
              className="tabular"
              disabled={draft.trackRecipe && draft.recipe.length > 0}
            />
          </Field>
        </div>

        <Field label="Description">
          <Textarea value={draft.description} onChange={(e) => set('description', e.target.value)} maxLength={500} rows={2} />
        </Field>

        <div className="flex flex-wrap gap-4">
          {(
            [
              ['isActive', 'Available for sale'],
              ['isFavorite', 'Show as favourite'],
              ['trackRecipe', 'Deduct ingredients automatically'],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={draft[key]}
                onChange={(e) => set(key, e.target.checked)}
                className="h-4 w-4 rounded border-input accent-[hsl(var(--primary))]"
              />
              {label}
            </label>
          ))}
        </div>

        {/* Recipe */}
        <section className="rounded-lg border border-border p-3">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h4 className="text-sm font-semibold">Recipe</h4>
              <p className="text-xs text-muted-foreground">Quantity consumed per single unit sold</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => set('recipe', [...draft.recipe, { ingredientId: '', quantity: 0 }])}
            >
              <Plus className="h-4 w-4" />
              Add ingredient
            </Button>
          </div>

          {draft.recipe.length === 0 ? (
            <p className="py-3 text-center text-sm text-muted-foreground">
              No ingredients linked — stock will not be deducted for this product.
            </p>
          ) : (
            <ul className="space-y-2">
              {draft.recipe.map((line, index) => {
                const ingredient = ingredients.find((i) => i.id === line.ingredientId);
                return (
                  <li key={index} className="flex items-center gap-2">
                    <Select
                      value={line.ingredientId}
                      onChange={(e) => {
                        const next = [...draft.recipe];
                        next[index] = { ...line, ingredientId: e.target.value };
                        set('recipe', next);
                      }}
                      className="h-10 flex-1"
                      aria-label="Ingredient"
                    >
                      <option value="">Select ingredient</option>
                      {ingredients.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.name} ({option.unit.toLowerCase()})
                        </option>
                      ))}
                    </Select>
                    <Input
                      type="number"
                      min={0}
                      step="any"
                      value={line.quantity || ''}
                      onChange={(e) => {
                        const next = [...draft.recipe];
                        next[index] = { ...line, quantity: Number(e.target.value) };
                        set('recipe', next);
                      }}
                      className="tabular h-10 w-24"
                      aria-label="Quantity"
                    />
                    <span className="w-16 shrink-0 text-xs text-muted-foreground">
                      {ingredient?.unit.toLowerCase() ?? ''}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                      aria-label="Remove ingredient"
                      onClick={() => set('recipe', draft.recipe.filter((_, i) => i !== index))}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="mt-3 flex flex-wrap gap-4 rounded-md bg-muted/60 px-3 py-2 text-sm">
            <span>
              Cost: <strong className="tabular">{formatCurrency(effectiveCost)}</strong>
            </span>
            <span>
              Price: <strong className="tabular">{formatCurrency(draft.basePrice)}</strong>
            </span>
            <span className={margin >= 50 ? 'text-success' : margin >= 25 ? '' : 'text-warning'}>
              Margin: <strong>{formatPercent(margin)}</strong>
            </span>
          </div>
        </section>

        {/* Variants */}
        <section className="rounded-lg border border-border p-3">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h4 className="text-sm font-semibold">Variants</h4>
              <p className="text-xs text-muted-foreground">Sizes or options — the multiplier scales the recipe</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => set('variants', [...draft.variants, { name: '', priceDelta: 0, recipeMultiplier: 1 }])}
            >
              <Plus className="h-4 w-4" />
              Add variant
            </Button>
          </div>

          {draft.variants.length === 0 ? (
            <p className="py-3 text-center text-sm text-muted-foreground">No variants — sold as a single option.</p>
          ) : (
            <ul className="space-y-2">
              {draft.variants.map((variant, index) => (
                <li key={index} className="flex items-center gap-2">
                  <Input
                    value={variant.name}
                    onChange={(e) => {
                      const next = [...draft.variants];
                      next[index] = { ...variant, name: e.target.value };
                      set('variants', next);
                    }}
                    placeholder="e.g. Large"
                    className="h-10 flex-1"
                    aria-label="Variant name"
                  />
                  <Input
                    type="number"
                    value={variant.priceDelta}
                    onChange={(e) => {
                      const next = [...draft.variants];
                      next[index] = { ...variant, priceDelta: Number(e.target.value) };
                      set('variants', next);
                    }}
                    className="tabular h-10 w-28"
                    aria-label="Price difference"
                    title="Price difference"
                  />
                  <Input
                    type="number"
                    min={0.1}
                    step="0.1"
                    value={variant.recipeMultiplier}
                    onChange={(e) => {
                      const next = [...draft.variants];
                      next[index] = { ...variant, recipeMultiplier: Number(e.target.value) };
                      set('variants', next);
                    }}
                    className="tabular h-10 w-20"
                    aria-label="Recipe multiplier"
                    title="Recipe multiplier"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive"
                    aria-label="Remove variant"
                    onClick={() => set('variants', draft.variants.filter((_, i) => i !== index))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Modal>
  );
}
