import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation"
import React, { useEffect, useState } from "react"
import { toast } from "sonner";

// app/(auth)/verify-email/page.tsx
export default function VerifyEmailPage() {
  const [resending, setResending] = useState(false)
  const [user, setUser] = useState<any>(null)
  const router = useRouter();
  const supabase = createClient()
  
  useEffect(() => {
    checkUser()
  }, [])
  
  const checkUser = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push('/login')
      return
    }
    
    if (user.email_confirmed_at) {
      router.push('/dashboard')
      return
    }
    
    setUser(user)
  }
  
  const resendEmail = async () => {
    setResending(true)
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: user?.email,
      })
      
      if (!error) {
        toast.success('Verification email sent!')
      }
    } finally {
      setResending(false)
    }
  }
  
  return (
    <div className="verify-email-container">
      <h2>Verify Your Email</h2>
      <p>We've sent a verification email to {user?.email}</p>
      <button onClick={resendEmail} disabled={resending}>
        Resend Email
      </button>
    </div>
  )
}