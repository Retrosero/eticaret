/**
 * UBL 2.1 XML fatura oluşturucu.
 *
 * GİB e-Fatura ve e-Arşiv şemasına uygun UBL-TR XML üretir.
 * NES adaptörü bu XML'i kendi JSON+hash formatına dönüştürür.
 *
 * Referans: http://www.efatura.gov.tr/dosyalar/kilavuzlar/UBL-TR_Rehberi.pdf
 */
import type {
  CreateInvoiceRequest,
  InvoiceLine,
  PartyInfo,
} from './types.js';

// ---------------------------------------------------------------------------
// Yardımcılar
// ---------------------------------------------------------------------------

/** Tarihi ISO formatına çevir (YYYY-MM-DD). */
function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Para değerini 15,4 hassasiyetle string'e çevir. */
function decimalStr(value: number): string {
  return value.toFixed(4);
}

/** XML escape. */
function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// ---------------------------------------------------------------------------
// Taraf (Party) XML
// ---------------------------------------------------------------------------

function buildPartyXml(party: PartyInfo, role: 'supplier' | 'customer'): string {
  const partyTag = role === 'supplier' ? 'SupplierParty' : 'CustomerParty';
  const partyInner = role === 'supplier' ? 'Party' : 'Party';

  const taxScheme =
    party.taxId.length === 11
      ? `<cbc:SchemeName>T.C. Kimlik Numarası</cbc:SchemeName>`
      : `<cbc:SchemeName>Vergi Kimlik Numarası</cbc:SchemeName>`;

  return `
  <${partyTag}>
    <${partyInner}>
      <cbc:WebsiteURI>${party.email ? xmlEscape(`mailto:${party.email}`) : ''}</cbc:WebsiteURI>
      <cac:PartyIdentification>
        <cbc:ID schemeID="VKN">${xmlEscape(party.taxId)}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyName>
        <cbc:Name>${xmlEscape(party.legalName)}</cbc:Name>
      </cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>${xmlEscape(party.address.street)}</cbc:StreetName>
        <cbc:CitySubdivisionName>${xmlEscape(party.address.district ?? '')}</cbc:CitySubdivisionName>
        <cbc:CityName>${xmlEscape(party.address.city)}</cbc:CityName>
        <cac:Country>
          <cbc:IdentificationCode>${xmlEscape(party.address.country)}</cbc:IdentificationCode>
          <cbc:Name>Türkiye</cbc:Name>
        </cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cac:TaxScheme>
          ${taxScheme}
        </cac:TaxScheme>
        ${party.taxOffice ? `<cac:TaxScheme><cbc:Name>${xmlEscape(party.taxOffice)}</cbc:Name></cac:TaxScheme>` : ''}
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${xmlEscape(party.legalName)}</cbc:RegistrationName>
        ${party.mersisNo ? `<cbc:CompanyID>${xmlEscape(party.mersisNo)}</cbc:CompanyID>` : ''}
      </cac:PartyLegalEntity>
      <cac:Contact>
        ${party.phone ? `<cbc:Telephone>${xmlEscape(party.phone)}</cbc:Telephone>` : ''}
        ${party.email ? `<cbc:ElectronicMail>${xmlEscape(party.email)}</cbc:ElectronicMail>` : ''}
      </cac:Contact>
    </${partyInner}>
  </${partyTag}>`;
}

// ---------------------------------------------------------------------------
// Satır (InvoiceLine) XML
// ---------------------------------------------------------------------------

function buildLineXml(line: InvoiceLine, currency: string): string {
  const lineTotal = line.quantity * line.unitPrice;
  const taxAmount = lineTotal * (line.taxRate / 100);

  return `
  <cac:InvoiceLine>
    <cbc:ID>${line.index}</cbc:ID>
    <cbc:InvoicedQuantity unitCode="${xmlEscape(line.unit)}">${line.quantity}</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="${currency}">${decimalStr(lineTotal)}</cbc:LineExtensionAmount>
    <cac:TaxTotal>
      <cbc:TaxAmount currencyID="${currency}">${decimalStr(taxAmount)}</cbc:TaxAmount>
      <cac:TaxSubtotal>
        <cbc:TaxableAmount currencyID="${currency}">${decimalStr(lineTotal)}</cbc:TaxableAmount>
        <cbc:TaxAmount currencyID="${currency}">${decimalStr(taxAmount)}</cbc:TaxAmount>
        <cac:TaxCategory>
          <cac:TaxScheme>
            <cbc:Name>KDV</cbc:Name>
            <cbc:TaxTypeCode>0015</cbc:TaxTypeCode>
          </cac:TaxScheme>
        </cac:TaxCategory>
      </cac:TaxSubtotal>
    </cac:TaxTotal>
    <cac:Item>
      <cbc:Name>${xmlEscape(line.name)}</cbc:Name>
      ${line.description ? `<cbc:Description>${xmlEscape(line.description)}</cbc:Description>` : ''}
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="${currency}">${decimalStr(line.unitPrice)}</cbc:PriceAmount>
    </cac:Price>
  </cac:InvoiceLine>`;
}

// ---------------------------------------------------------------------------
// Ana Builder
// ---------------------------------------------------------------------------

export interface UblOptions {
  /** Fatura UUID'si (e-fatura için zorunlu, GİB atar). */
  uuid?: string;
  /** Profil ID (e-fatura: 'TEMELFATURA', e-arşiv: 'EARSIVFATURA'). */
  profileId?: string;
  /** Senaryo (e-fatura: 'TEMELFATURA', e-arşiv: 'EARSIVFATURA'). */
  scenario?: 'TEMELFATURA' | 'EARSIVFATURA' | 'EIRSALIYE';
}

/**
 * Verilen `CreateInvoiceRequest`'ten UBL-TR XML üretir.
 */
export function buildInvoiceUbl(req: CreateInvoiceRequest, options: UblOptions = {}): string {
  const lineExtension = req.lines.reduce(
    (acc: number, l: InvoiceLine) => acc + l.quantity * l.unitPrice,
    0,
  );
  const taxExclusive = lineExtension;
  const taxTotal = req.lines.reduce(
    (acc: number, l: InvoiceLine) => acc + l.quantity * l.unitPrice * (l.taxRate / 100),
    0,
  );
  const payable = taxExclusive + taxTotal;

  const scenario =
    options.scenario ??
    (req.type === 'e_fatura' ? 'TEMELFATURA' : req.type === 'e_arsiv' ? 'EARSIVFATURA' : 'EIRSALIYE');

  const profileId =
    options.profileId ??
    (req.type === 'e_fatura' ? 'TEMELFATURA' : req.type === 'e_arsiv' ? 'EARSIVFATURA' : 'EIRSALIYE');

  const rootTag = req.type === 'e_irsaliye' ? 'DespatchAdvice' : 'Invoice';

  const linesXml = req.lines.map((l: InvoiceLine) => buildLineXml(l, req.currency)).join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<${rootTag}
  xmlns="urn:oasis:names:specification:ubl:schema:xsd:${rootTag}-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
  <cbc:CustomizationID>TR1.2</cbc:CustomizationID>
  <cbc:ProfileID>${profileId}</cbc:ProfileID>
  <cbc:ID>${xmlEscape(req.invoiceNumber)}</cbc:ID>
  <cbc:CopyIndicator>false</cbc:CopyIndicator>
  <cbc:UUID schemeID="UUID">${options.uuid ?? '00000000-0000-0000-0000-000000000000'}</cbc:UUID>
  <cbc:IssueDate>${isoDate(req.issueDate)}</cbc:IssueDate>
  ${req.dueDate ? `<cbc:DueDate>${isoDate(req.dueDate)}</cbc:DueDate>` : ''}
  ${req.type === 'e_irsaliye' ? `<cbc:DespatchAdviceTypeCode>SEVK</cbc:DespatchAdviceTypeCode>` : `<cbc:InvoiceTypeCode>${scenario === 'EARSIVFATURA' ? 'EARSIV' : 'SATIS'}</cbc:InvoiceTypeCode>`}
  <cbc:DocumentCurrencyCode>${req.currency}</cbc:DocumentCurrencyCode>
  ${req.exchangeRate ? `<cac:ExchangeRate><cbc:CalculationRate>${req.exchangeRate}</cbc:CalculationRate></cac:ExchangeRate>` : ''}
  ${buildPartyXml(req.seller, 'supplier')}
  ${buildPartyXml(req.buyer, 'customer')}
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="${req.currency}">${decimalStr(taxTotal)}</cbc:TaxAmount>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${req.currency}">${decimalStr(taxExclusive)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="${req.currency}">${decimalStr(taxExclusive)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="${req.currency}">${decimalStr(payable)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="${req.currency}">${decimalStr(payable)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  ${linesXml}
  ${req.notes ? `<cbc:Note>${xmlEscape(req.notes)}</cbc:Note>` : ''}
</${rootTag}>`;

  return xml;
}

/**
 * UBL XML'in SHA-256 hash'ini hesaplar (NES'in doğrulama için istediği).
 */
export async function sha256Xml(xml: string): Promise<string> {
  const { createHash } = await import('crypto');
  return createHash('sha256').update(xml, 'utf8').digest('hex');
}