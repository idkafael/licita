'use client'

import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function Header() {
  const router = useRouter()

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <header style={{
      background: 'white',
      borderBottom: '1px solid #e2e8f0',
      padding: '0 32px',
      height: '60px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      position: 'sticky',
      top: 0,
      zIndex: 100,
      boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{
          width: '36px',
          height: '36px',
          borderRadius: '9px',
          background: 'linear-gradient(135deg, #1e40af, #3b82f6)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
          </svg>
        </div>
        <span style={{ fontSize: '17px', fontWeight: '700', color: '#0f172a' }}>
          LicitaFácil
        </span>
      </div>

      <nav style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <a href="/dashboard" style={{
          padding: '7px 14px',
          borderRadius: '7px',
          fontSize: '13px',
          fontWeight: '500',
          color: '#475569',
          textDecoration: 'none',
          transition: 'background 0.15s',
        }}
          onMouseEnter={e => (e.currentTarget.style.background = '#f1f5f9')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          Dashboard
        </a>
        <a href="/licitacoes/nova" style={{
          padding: '7px 14px',
          borderRadius: '7px',
          fontSize: '13px',
          fontWeight: '500',
          color: '#475569',
          textDecoration: 'none',
          transition: 'background 0.15s',
        }}
          onMouseEnter={e => (e.currentTarget.style.background = '#f1f5f9')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          Nova Licitação
        </a>

        <button
          onClick={handleLogout}
          style={{
            marginLeft: '8px',
            padding: '7px 14px',
            borderRadius: '7px',
            fontSize: '13px',
            fontWeight: '500',
            color: '#dc2626',
            background: 'transparent',
            border: '1px solid #fecaca',
            cursor: 'pointer',
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = '#fef2f2'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'transparent'
          }}
        >
          Sair
        </button>
      </nav>
    </header>
  )
}
