// lib/services/email.ts
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY!)

interface SendEmailParams {
  to: string
  subject: string
  html: string
  from?: string
}

export async function sendEmail({ to, subject, html, from }: SendEmailParams) {
  try {
    const { data, error } = await resend.emails.send({
      from: from || process.env.RESEND_FROM_EMAIL || 'GST InvoiceNow <noreply@yourdomain.sg>',
      to,
      subject,
      html,
    })

    if (error) {
      console.error('Resend error:', error)
      throw error
    }

    return { success: true, data }
  } catch (error) {
    console.error('Email send error:', error)
    return { success: false, error }
  }
}

// Email templates
export const emailTemplates = {
  welcome: (name: string, confirmUrl: string) => ({
    subject: 'Welcome to GST InvoiceNow - Please verify your email',
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Welcome to GST InvoiceNow</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #1e40af; color: white; padding: 20px; text-align: center; }
            .content { background-color: #f9fafb; padding: 30px; }
            .button { display: inline-block; padding: 12px 24px; background-color: #3b82f6; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .footer { text-align: center; padding: 20px; font-size: 12px; color: #6b7280; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Welcome to GST InvoiceNow</h1>
            </div>
            <div class="content">
              <h2>Hi ${name},</h2>
              <p>Thank you for signing up for GST InvoiceNow! We're excited to help you streamline your GST compliance.</p>
              <p>Please confirm your email address to complete your registration:</p>
              <center>
                <a href="${confirmUrl}" class="button">Verify Email Address</a>
              </center>
              <p>This link will expire in 24 hours.</p>
              <p>If you didn't create an account, please ignore this email.</p>
              <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
              <p style="font-size: 14px; color: #6b7280;">
                <strong>Why verify your email?</strong><br>
                Email verification helps us ensure the security of your account and enables important notifications about your invoices.
              </p>
            </div>
            <div class="footer">
              <p>© 2024 GST InvoiceNow. All rights reserved.</p>
              <p>Your data is protected under Singapore's Personal Data Protection Act (PDPA)</p>
            </div>
          </div>
        </body>
      </html>
    `
  }),

  passwordReset: (resetUrl: string) => ({
    subject: 'Reset your GST InvoiceNow password',
    html: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Reset Password</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #1e40af; color: white; padding: 20px; text-align: center; }
            .content { background-color: #f9fafb; padding: 30px; }
            .button { display: inline-block; padding: 12px 24px; background-color: #3b82f6; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .footer { text-align: center; padding: 20px; font-size: 12px; color: #6b7280; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Password Reset Request</h1>
            </div>
            <div class="content">
              <p>You've requested to reset your password for GST InvoiceNow.</p>
              <p>Click the button below to create a new password:</p>
              <center>
                <a href="${resetUrl}" class="button">Reset Password</a>
              </center>
              <p>This link will expire in 1 hour.</p>
              <p>If you didn't request this, please ignore this email. Your password won't be changed.</p>
            </div>
            <div class="footer">
              <p>© 2024 GST InvoiceNow. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `
  })
}