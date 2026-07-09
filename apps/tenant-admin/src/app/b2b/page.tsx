'use client';

import { useEffect, useState } from 'react';
import { Building2, FileText, CheckCircle2, Check, X } from 'lucide-react';
import { DashboardLayout } from '@/components/dashboard-layout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea, Label } from '@/components/ui/input';
import { Dialog } from '@/components/ui/dialog';
import { apiClient, extractApiError } from '@/lib/api-client';
import { formatCurrency, formatDateShort } from '@/lib/utils';
import type { CompanyAccount, Quote, OrderApproval } from '@/lib/api-types';

function B2BContent() {
  const [companies, setCompanies] = useState<CompanyAccount[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [approvals, setApprovals] = useState<OrderApproval[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Onay işlemleri
  const [decisionOpen, setDecisionOpen] = useState(false);
  const [decisionTarget, setDecisionTarget] = useState<OrderApproval | null>(null);
  const [decisionType, setDecisionType] = useState<'approve' | 'reject'>('approve');
  const [decisionNote, setDecisionNote] = useState('');
  const [isDeciding, setIsDeciding] = useState(false);

  // Bayi onayı
  const [companyDecisionOpen, setCompanyDecisionOpen] = useState(false);
  const [companyDecisionTarget, setCompanyDecisionTarget] = useState<CompanyAccount | null>(null);
  const [companyAction, setCompanyAction] = useState<'approve' | 'suspend'>('approve');

  async function load() {
    try {
      setIsLoading(true);
      const [companiesRes, quotesRes, approvalsRes] = await Promise.allSettled([
        apiClient.get('/b2b/companies'),
        apiClient.get('/b2b/quotes'),
        apiClient.get('/b2b/approval/list'),
      ]);

      setCompanies(
        companiesRes.status === 'fulfilled'
          ? ((companiesRes.value.data as any).items ?? companiesRes.value.data ?? [])
          : [],
      );
      setQuotes(
        quotesRes.status === 'fulfilled'
          ? ((quotesRes.value.data as any).items ?? quotesRes.value.data ?? [])
          : [],
      );
      setApprovals(
        approvalsRes.status === 'fulfilled'
          ? ((approvalsRes.value.data as any).items ?? approvalsRes.value.data ?? [])
          : [],
      );
    } catch (err) {
      setError(extractApiError(err));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function openDecisionDialog(approval: OrderApproval, type: 'approve' | 'reject') {
    setDecisionTarget(approval);
    setDecisionType(type);
    setDecisionNote('');
    setDecisionOpen(true);
  }

  async function handleDecision() {
    if (!decisionTarget) return;
    setIsDeciding(true);
    try {
      const endpoint =
        decisionType === 'approve'
          ? `/b2b/approval/${decisionTarget.id}/approve`
          : `/b2b/approval/${decisionTarget.id}/reject`;
      await apiClient.post(endpoint, {
        actorId: 'admin',
        note: decisionNote || (decisionType === 'approve' ? 'Onaylandı' : 'Reddedildi'),
      });
      setDecisionOpen(false);
      await load();
    } catch (err) {
      setError(extractApiError(err));
    } finally {
      setIsDeciding(false);
    }
  }

  function openCompanyDecision(c: CompanyAccount, action: 'approve' | 'suspend') {
    setCompanyDecisionTarget(c);
    setCompanyAction(action);
    setCompanyDecisionOpen(true);
  }

  async function handleCompanyDecision() {
    if (!companyDecisionTarget) return;
    setIsDeciding(true);
    try {
      await apiClient.patch(`/b2b/companies/${companyDecisionTarget.id}`, {
        status: companyAction === 'approve' ? 'active' : 'suspended',
      });
      setCompanyDecisionOpen(false);
      await load();
    } catch (err) {
      setError(extractApiError(err));
    } finally {
      setIsDeciding(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">B2B Bayi Yönetimi</h2>
        <p className="text-sm text-muted-foreground">
          Bayi hesapları, teklifler ve sipariş onayları
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Bayi Sayısı</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{companies.length}</div>
            <p className="text-xs text-muted-foreground">
              {companies.filter((c) => c.status === 'pending_approval').length} onay bekliyor
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Açık Teklif</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {quotes.filter((q) => q.status === 'draft' || q.status === 'sent').length}
            </div>
            <p className="text-xs text-muted-foreground">Yanıt bekliyor</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Bekleyen Onay</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{approvals.filter((a) => a.status === 'pending').length}</div>
            <p className="text-xs text-muted-foreground">Yönetici kararı gerekli</p>
          </CardContent>
        </Card>
      </div>

      {/* Bayi Hesapları */}
      <Card>
        <CardHeader>
          <CardTitle>Bayi Hesapları</CardTitle>
          <CardDescription>B2B müşteri hesapları</CardDescription>
        </CardHeader>
        <CardContent>
          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : isLoading ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Yükleniyor…</p>
          ) : companies.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Henüz bayi hesabı yok.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Firma</TableHead>
                  <TableHead>VKN</TableHead>
                  <TableHead>Durum</TableHead>
                  <TableHead>Kredi Limiti</TableHead>
                  <TableHead>Vade</TableHead>
                  <TableHead>Kayıt Tarihi</TableHead>
                  <TableHead className="text-right">İşlem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {companies.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <p className="font-medium">{c.legalName}</p>
                      {c.tradeName && c.tradeName !== c.legalName && (
                        <p className="text-xs text-muted-foreground">{c.tradeName}</p>
                      )}
                    </TableCell>
                    <TableCell>
                      <code className="text-xs">{c.taxId}</code>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          c.status === 'active'
                            ? 'success'
                            : c.status === 'pending_approval'
                              ? 'outline'
                              : c.status === 'suspended'
                                ? 'warning'
                                : 'destructive'
                        }
                      >
                        {c.status === 'active'
                          ? 'Aktif'
                          : c.status === 'pending_approval'
                            ? 'Onay Bekliyor'
                            : c.status === 'suspended'
                              ? 'Askıda'
                              : 'Kapalı'}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">
                      {c.creditLimit ? formatCurrency(c.creditLimit) : '—'}
                    </TableCell>
                    <TableCell className="text-sm">{c.paymentTermDays} gün</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDateShort(c.createdAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      {c.status === 'pending_approval' && (
                        <Button size="sm" onClick={() => openCompanyDecision(c, 'approve')}>
                          Onayla
                        </Button>
                      )}
                      {c.status === 'active' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openCompanyDecision(c, 'suspend')}
                        >
                          Askıya Al
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Bekleyen Onaylar */}
      <Card>
        <CardHeader>
          <CardTitle>Bekleyen Sipariş Onayları</CardTitle>
          <CardDescription>Yönetici kararı gereken siparişler</CardDescription>
        </CardHeader>
        <CardContent>
          {approvals.filter((a) => a.status === 'pending').length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Bekleyen onay yok.</p>
          ) : (
            <ul className="space-y-3">
              {approvals
                .filter((a) => a.status === 'pending')
                .map((a) => (
                  <li
                    key={a.id}
                    className="flex items-center justify-between border-b last:border-0 pb-3"
                  >
                    <div>
                      <p className="font-medium">{a.orderNumber}</p>
                      <p className="text-xs text-muted-foreground">
                        {a.note ?? 'Not yok'} • {formatDateShort(a.createdAt)}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openDecisionDialog(a, 'reject')}
                      >
                        <X className="mr-1 h-3 w-3" />
                        Reddet
                      </Button>
                      <Button size="sm" onClick={() => openDecisionDialog(a, 'approve')}>
                        <Check className="mr-1 h-3 w-3" />
                        Onayla
                      </Button>
                    </div>
                  </li>
                ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Onay/Reddet Dialog */}
      <Dialog
        open={decisionOpen}
        onOpenChange={setDecisionOpen}
        title={decisionType === 'approve' ? 'Siparişi Onayla' : 'Siparişi Reddet'}
        description={`Sipariş: ${decisionTarget?.orderNumber}`}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setDecisionOpen(false)} disabled={isDeciding}>
              Vazgeç
            </Button>
            <Button
              variant={decisionType === 'reject' ? 'destructive' : 'default'}
              onClick={handleDecision}
              disabled={isDeciding}
            >
              {isDeciding
                ? 'İşleniyor…'
                : decisionType === 'approve'
                  ? 'Onayla'
                  : 'Reddet'}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="decision-note">Not</Label>
            <Textarea
              id="decision-note"
              rows={3}
              value={decisionNote}
              onChange={(e) => setDecisionNote(e.target.value)}
              placeholder={
                decisionType === 'approve'
                  ? 'Onay gerekçesi (opsiyonel)'
                  : 'Red gerekçesi (zorunlu)'
              }
              required={decisionType === 'reject'}
            />
          </div>
        </div>
      </Dialog>

      {/* Bayi Onayı/Askıya Alma Dialog */}
      <Dialog
        open={companyDecisionOpen}
        onOpenChange={setCompanyDecisionOpen}
        title={
          companyAction === 'approve' ? 'Bayi Hesabını Aktifleştir' : 'Bayi Hesabını Askıya Al'
        }
        description={companyDecisionTarget?.legalName}
        size="sm"
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => setCompanyDecisionOpen(false)}
              disabled={isDeciding}
            >
              Vazgeç
            </Button>
            <Button
              variant={companyAction === 'suspend' ? 'destructive' : 'default'}
              onClick={handleCompanyDecision}
              disabled={isDeciding}
            >
              {isDeciding
                ? 'İşleniyor…'
                : companyAction === 'approve'
                  ? 'Aktifleştir'
                  : 'Askıya Al'}
            </Button>
          </>
        }
      >
        <div className="space-y-2 text-sm">
          {companyAction === 'approve' ? (
            <p className="text-muted-foreground">
              Bu bayi hesabı aktifleştirilecek. Bayi, B2B fiyat listelerinden alışveriş yapabilir ve
              teklif talebi gönderebilir.
            </p>
          ) : (
            <p className="text-muted-foreground">
              Bu bayi hesabı askıya alınacak. Bayi giriş yapamayacak ve işlem gerçekleştiremeyecek.
            </p>
          )}
          {error && <p className="text-destructive text-xs mt-2">{error}</p>}
        </div>
      </Dialog>
    </div>
  );
}

export default function B2BPage() {
  return (
    <DashboardLayout>
      <B2BContent />
    </DashboardLayout>
  );
}