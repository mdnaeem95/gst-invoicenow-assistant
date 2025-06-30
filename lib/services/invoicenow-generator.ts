import { ParsedInvoiceData } from './invoice-parser'

interface CompanyData {
  name: string
  uen: string
  address: string
  gstNumber: string
}

export class InvoiceNowGenerator {
  /**
   * Generate InvoiceNow compliant XML based on PEPPOL BIS 3.0 standard
   */
  generateXML(invoice: ParsedInvoiceData, company: CompanyData): string {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  
  <!-- PEPPOL BIS 3.0 Singapore -->
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#conformant#urn:fdc:peppol.eu:2017:poacc:billing:international:sg:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  
  <!-- Invoice Details -->
  <cbc:ID>${this.escapeXml(invoice.invoiceNumber || 'INV-001')}</cbc:ID>
  <cbc:IssueDate>${invoice.invoiceDate || new Date().toISOString().split('T')[0]}</cbc:IssueDate>
  ${invoice.dueDate ? `<cbc:DueDate>${invoice.dueDate}</cbc:DueDate>` : ''}
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>SGD</cbc:DocumentCurrencyCode>
  <cbc:BuyerReference>BUYER-REF</cbc:BuyerReference>
  
  <!-- Supplier (Seller) Information -->
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="0195">${this.escapeXml(company.uen)}</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyName>
        <cbc:Name>${this.escapeXml(company.name)}</cbc:Name>
      </cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>${this.escapeXml(company.address)}</cbc:StreetName>
        <cbc:CityName>Singapore</cbc:CityName>
        <cbc:PostalZone>000000</cbc:PostalZone>
        <cac:Country>
          <cbc:IdentificationCode>SG</cbc:IdentificationCode>
        </cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>${this.escapeXml(company.gstNumber)}</cbc:CompanyID>
        <cac:TaxScheme>
          <cbc:ID>GST</cbc:ID>
        </cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${this.escapeXml(company.name)}</cbc:RegistrationName>
        <cbc:CompanyID schemeID="0195">${this.escapeXml(company.uen)}</cbc:CompanyID>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
  
  <!-- Customer (Buyer) Information -->
  <cac:AccountingCustomerParty>
    <cac:Party>
      ${invoice.customerUEN ? `
      <cac:PartyIdentification>
        <cbc:ID schemeID="0195">${this.escapeXml(invoice.customerUEN)}</cbc:ID>
      </cac:PartyIdentification>` : ''}
      <cac:PartyName>
        <cbc:Name>${this.escapeXml(invoice.customerName || 'Customer')}</cbc:Name>
      </cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>Customer Address</cbc:StreetName>
        <cbc:CityName>Singapore</cbc:CityName>
        <cbc:PostalZone>000000</cbc:PostalZone>
        <cac:Country>
          <cbc:IdentificationCode>SG</cbc:IdentificationCode>
        </cac:Country>
      </cac:PostalAddress>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${this.escapeXml(invoice.customerName || 'Customer')}</cbc:RegistrationName>
        ${invoice.customerUEN ? `<cbc:CompanyID schemeID="0195">${this.escapeXml(invoice.customerUEN)}</cbc:CompanyID>` : ''}
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>
  
  <!-- Payment Terms -->
  <cac:PaymentTerms>
    <cbc:Note>${invoice.paymentTerms || 'Net 30 days'}</cbc:Note>
  </cac:PaymentTerms>
  
  <!-- Tax Total -->
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="SGD">${this.formatAmount(invoice.gstAmount || 0)}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="SGD">${this.formatAmount(invoice.subtotal || 0)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="SGD">${this.formatAmount(invoice.gstAmount || 0)}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>9</cbc:Percent>
        <cac:TaxScheme>
          <cbc:ID>GST</cbc:ID>
        </cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  
  <!-- Monetary Totals -->
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="SGD">${this.formatAmount(invoice.subtotal || 0)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="SGD">${this.formatAmount(invoice.subtotal || 0)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="SGD">${this.formatAmount(invoice.totalAmount || 0)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="SGD">${this.formatAmount(invoice.totalAmount || 0)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  
  <!-- Invoice Lines -->
  ${this.generateInvoiceLines(invoice.items)}
  
</Invoice>`

    return xml
  }

  /**
   * Generate invoice line items
   */
  private generateInvoiceLines(items: ParsedInvoiceData['items']): string {
    if (!items || items.length === 0) {
      // At least one line item is required
      return `
  <cac:InvoiceLine>
    <cbc:ID>1</cbc:ID>
    <cbc:InvoicedQuantity unitCode="C62">1</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="SGD">0.00</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Name>Service</cbc:Name>
      <cac:ClassifiedTaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>9</cbc:Percent>
        <cac:TaxScheme>
          <cbc:ID>GST</cbc:ID>
        </cac:TaxScheme>
      </cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="SGD">0.00</cbc:PriceAmount>
    </cac:Price>
  </cac:InvoiceLine>`
    }

    return items.map((item, index) => `
  <cac:InvoiceLine>
    <cbc:ID>${index + 1}</cbc:ID>
    <cbc:InvoicedQuantity unitCode="C62">${item.quantity}</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="SGD">${this.formatAmount(item.amount)}</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Name>${this.escapeXml(item.description)}</cbc:Name>
      <cac:ClassifiedTaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>9</cbc:Percent>
        <cac:TaxScheme>
          <cbc:ID>GST</cbc:ID>
        </cac:TaxScheme>
      </cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="SGD">${this.formatAmount(item.unitPrice)}</cbc:PriceAmount>
    </cac:Price>
  </cac:InvoiceLine>`).join('')
  }

  /**
   * Escape XML special characters
   */
  private escapeXml(text: string): string {
    if (!text) return ''
    
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;')
  }

  /**
   * Format amount to 2 decimal places
   */
  private formatAmount(amount: number): string {
    return amount.toFixed(2)
  }

  /**
   * Validate generated XML against InvoiceNow requirements
   */
  validateXML(xml: string): { isValid: boolean; errors: string[] } {
    const errors: string[] = []

    // Basic validation checks
    if (!xml.includes('<cbc:ID>')) {
      errors.push('Missing Invoice ID')
    }
    if (!xml.includes('<cbc:IssueDate>')) {
      errors.push('Missing Issue Date')
    }
    if (!xml.includes('<cac:AccountingSupplierParty>')) {
      errors.push('Missing Supplier Information')
    }
    if (!xml.includes('<cac:AccountingCustomerParty>')) {
      errors.push('Missing Customer Information')
    }
    if (!xml.includes('<cac:InvoiceLine>')) {
      errors.push('Missing Invoice Lines')
    }
    if (!xml.includes('<cac:TaxTotal>')) {
      errors.push('Missing Tax Information')
    }

    return {
      isValid: errors.length === 0,
      errors
    }
  }
}