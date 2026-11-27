import { useEffect, useState } from 'react'
import { Download, Share, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function PwaInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [showIosGuide, setShowIosGuide] = useState(false)
  const [dismissed, setDismissed] = useState(() => localStorage.getItem('bs_pwa_dismissed') === '1')

  useEffect(() => {
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true

    if (isStandalone || dismissed) return

    const ua = window.navigator.userAgent.toLowerCase()
    const isIos = /iphone|ipad|ipod/.test(ua)
    if (isIos) {
      setShowIosGuide(true)
    }

    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [dismissed])

  const dismiss = () => {
    localStorage.setItem('bs_pwa_dismissed', '1')
    setDismissed(true)
    setShowIosGuide(false)
    setDeferredPrompt(null)
  }

  if (dismissed || (!deferredPrompt && !showIosGuide)) return null

  return (
    <div className="fixed bottom-16 lg:bottom-4 right-4 z-40 max-w-sm rounded-xl border border-blue-200 bg-white p-3.5 shadow-lg flex items-start gap-3">
      <img src="/logo.png" alt="Bông Sen" className="h-9 w-9 rounded-lg object-contain bg-blue-50 p-1 shrink-0" />
      <div className="flex-1 text-xs space-y-1.5">
        <div className="font-semibold text-slate-900">Cài đặt Bông Sen Workspace</div>
        {deferredPrompt ? (
          <>
            <p className="text-slate-600">
              Cài ứng dụng lên màn hình để truy cập nhanh như app native.
            </p>
            <Button
              size="sm"
              className="h-7 text-xs"
              onClick={async () => {
                await deferredPrompt.prompt()
                await deferredPrompt.userChoice
                setDeferredPrompt(null)
              }}
            >
              <Download className="h-3.5 w-3.5" /> Cài đặt ngay
            </Button>
          </>
        ) : (
          <p className="text-slate-600 leading-relaxed">
            Trên iPhone/iPad: bấm biểu tượng <Share className="inline h-3.5 w-3.5 text-primary" />{' '}
            <strong>Chia sẻ</strong> rồi chọn <strong>Thêm vào Màn hình chính</strong>.
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={dismiss}
        className="text-slate-400 hover:text-slate-600 p-0.5"
        aria-label="Đóng gợi ý cài đặt"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  )
}
