import { ParsedInvoiceData } from "./invoice-parser";

export class InvoiceNowGenerator {
    generateXML(invoice: ParsedInvoiceData, companyData: any): string {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
  <Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
           xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
           xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
    <cbc:CustomizationID>urn:cen.eu:en16931:2017#conformant#urn:fdc:peppol.eu:2017:poacc:billing:international:sg:3.0</cbc:CustomizationID>
    <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
    <cbc:ID>${invoice.invoiceNumber || 'INV-001'}</cbc:ID>
    <cbc:IssueDate>${invoice.invoiceDate || new Date().toISOString().split('T')[0]}</cbc:IssueDate>
    ${invoice.dueDate ? `<cbc:DueDate>${invoice.dueDate}</cbc:DueDate>` : ''}
    <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
    <cbc:DocumentCurrencyCode>SGD</cbc:DocumentCurrencyCode>
    
    <cac:AccountingSupplierParty>
      <cac:Party>
        <cac:PartyIdentification>
          <cbc:ID schemeID="0195">${companyData.uen}</cbc:ID>
        </cac:PartyIdentification>
        <cac:PartyName>
          <cbc:Name>${companyData.name}</cbc:Name>
        </cac:PartyName>
        <cac:PostalAddress>
          <cbc:StreetName>${companyData.address}</cbc:StreetName>
          <cbc:CityName>Singapore</cbc:CityName>
          <cbc:CountrySubentity>SG</cbc:CountrySubentity>
          <cac:Country>
            <cbc:IdentificationCode>SG</cbc:IdentificationCode>
          </cac:Country>
        </cac:PostalAddress>
        <cac:PartyTaxScheme>
          <cbc:CompanyID>${companyData.gstNumber}</cbc:CompanyID>
          <cac:TaxScheme>
            <cbc:ID>GST</cbc:ID>
          </cac:TaxScheme>
        </cac:PartyTaxScheme>
      </cac:Party>
    </cac:AccountingSupplierParty>
    
    <cac:AccountingCustomerParty>
      <cac:Party>
        ${invoice.customerUEN ? `
        <cac:PartyIdentification>
          <cbc:ID schemeID="0195">${invoice.customerUEN}</cbc:ID>
        </cac:PartyIdentification>
        ` : ''}
        <cac:PartyName>
          <cbc:Name>${invoice.customerName || 'Customer'}</cbc:Name>
        </cac:PartyName>
      </cac:Party>
    </cac:AccountingCustomerParty>
    
    <cac:TaxTotal>
      <cbc:TaxAmount currencyID="SGD">${invoice.gstAmount || '0.00'}</cbc:TaxAmount>
      <cac:TaxSubtotal>
        <cbc:TaxableAmount currencyID="SGD">${invoice.subtotal || '0.00'}</cbc:TaxableAmount>
        <cbc:TaxAmount currencyID="SGD">${invoice.gstAmount || '0.00'}</cbc:TaxAmount>
        <cac:TaxCategory>
          <cbc:ID>S</cbc:ID>
          <cbc:Percent>9</cbc:Percent>
          <cac:TaxScheme>
            <cbc:ID>GST</cbc:ID>
          </cac:TaxScheme>
        </cac:TaxCategory>
      </cac:TaxSubtotal>
    </cac:TaxTotal>
    
    <cac:LegalMonetaryTotal>
      <cbc:LineExtensionAmount currencyID="SGD">${invoice.subtotal || '0.00'}</cbc:LineExtensionAmount>
      <cbc:TaxExclusiveAmount currencyID="SGD">${invoice.subtotal || '0.00'}</cbc:TaxExclusiveAmount>
      <cbc:TaxInclusiveAmount currencyID="SGD">${invoice.totalAmount || '0.00'}</cbc:TaxInclusiveAmount>
      <cbc:PayableAmount currencyID="SGD">${invoice.totalAmount || '0.00'}</cbc:PayableAmount>
    </cac:LegalMonetaryTotal>
    
    ${invoice.items.map((item, index) => `
    <cac:InvoiceLine>
      <cbc:ID>${index + 1}</cbc:ID>
      <cbc:InvoicedQuantity unitCode="EA">${item.quantity}</cbc:InvoicedQuantity>
      <cbc:LineExtensionAmount currencyID="SGD">${item.amount.toFixed(2)}</cbc:LineExtensionAmount>
      <cac:Item>
        <cbc:Description>${this.escapeXML(item.description)}</cbc:Description>
      </cac:Item>
      <cac:Price>
        <cbc:PriceAmount currencyID="SGD">${item.unitPrice.toFixed(2)}</cbc:PriceAmount>
      </cac:Price>
    </cac:InvoiceLine>
    `).join('')}
  </Invoice>`
  
      return xml
    }
  
    private escapeXML(str: string): string {
      return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;')
    }
  
    validateXML(xml: string): { valid: boolean; errors: string[] } {
      const errors: string[] = []
      
      // Basic validation checks
      if (!xml.includes('<cbc:ID>')) {
        errors.push('Missing Invoice Number')
      }
      if (!xml.includes('<cbc:IssueDate>')) {
        errors.push('Missing Invoice Date')
      }
      if (!xml.includes('<cac:AccountingSupplierParty>')) {
        errors.push('Missing Supplier Information')
      }
      if (!xml.includes('<cac:AccountingCustomerParty>')) {
        errors.push('Missing Customer Information')
      }
      if (!xml.includes('<cac:InvoiceLine>')) {
        errors.push('Missing Invoice Line Items')
      }
      
      return {
        valid: errors.length === 0,
        errors
      }
    }
  }