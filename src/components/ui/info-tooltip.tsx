'use client'

import { useState } from 'react'
import { Info } from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from '@/components/ui/tooltip'

interface InfoTooltipProps {
  /** نص التعريف الذي يظهر داخل الغيمة */
  text: string
  /** حجم أيقونة التعجب/المعلومة (px) */
  size?: number
  className?: string
}

/**
 * أيقونة صغيرة على شكل "i" تظهر بجانب أي مصطلح (مثل CAPEX أو OPEX)
 * وعند التحويم عليها (أو الضغط عليها على الجوال) تظهر غيمة صغيرة
 * تشرح معنى المصطلح ووحدة قياسه.
 */
export function InfoTooltip({ text, size = 13, className }: InfoTooltipProps) {
  const [open, setOpen] = useState(false)

  return (
    <TooltipProvider>
      <Tooltip open={open} onOpenChange={setOpen}>
        <TooltipTrigger asChild>
          <button
            type="button"
            // منع أي سلوك افتراضي (مثل إرسال نموذج) والاكتفاء بفتح/إغلاق الغيمة،
            // هذا يجعلها تعمل بالنقر على الجوال وبالتحويم على سطح المكتب
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              setOpen((v) => !v)
            }}
            className={`inline-flex items-center justify-center align-middle text-muted-foreground/70 hover:text-primary transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-full ${className ?? ''}`}
            aria-label={text}
          >
            <Info size={size} strokeWidth={2} />
          </button>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          align="center"
          className="max-w-[240px] text-right leading-relaxed"
        >
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
