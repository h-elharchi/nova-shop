import { useState } from 'react'
import { MessageSquare } from 'lucide-react'
import { useI18n } from '../../context/LanguageContext'
import { useChat } from '../../hooks/useChat'
import { ChatWidget } from './ChatWidget'

export function ChatButton() {
  const { t, isRTL } = useI18n()
  const [minimized, setMinimized] = useState(false)
  const {
    widgetState,
    isOpen,
    conversation,
    queuePosition,
    countdown,
    openWidget,
    closeWidget,
    startChat,
    resetToIdle,
    startNewConversation,
  } = useChat()

  const handleButtonClick = () => {
    if (isOpen) {
      setMinimized(false)
    } else {
      openWidget()
      setMinimized(false)
    }
  }

  const handleMinimize = () => {
    setMinimized(true)
    closeWidget()
  }

  const handleClose = () => {
    resetToIdle()
    setMinimized(false)
  }

  const widgetOpen = isOpen && !minimized

  return (
    <>
      {widgetOpen && (
        <>
          {/* Backdrop mobile — tap to minimize */}
          <div
            className="sm:hidden fixed inset-0 z-40 bg-black/40"
            onClick={handleMinimize}
          />

          {/* Widget container
              Mobile  : full screen (inset-0)
              Desktop : anchored corner popup */}
          <div
            className={`
              fixed z-50 inset-0
              sm:inset-auto sm:bottom-[88px]
              ${isRTL ? 'sm:left-4' : 'sm:right-4'}
            `}
          >
            <ChatWidget
              widgetState={widgetState}
              conversation={conversation}
              queuePosition={queuePosition}
              countdown={countdown}
              onSubmitForm={startChat}
              onClose={handleClose}
              onMinimize={handleMinimize}
              onNewConversation={startNewConversation}
              onResetToIdle={handleClose}
            />
          </div>
        </>
      )}

      {/* Floating button — hidden on mobile when widget is open (full-screen overlay covers it) */}
      <button
        onClick={handleButtonClick}
        aria-label={t('chat.btn_label')}
        className={`
          fixed z-40 items-center gap-2
          bg-blue-600 hover:bg-blue-700 text-white
          rounded-full shadow-lg transition-all hover:scale-105 active:scale-95
          ${isRTL ? 'left-4' : 'right-4'}
          ${widgetOpen ? 'hidden sm:flex' : 'flex'}
        `}
        style={{ bottom: '24px' }}
      >
        <div className="flex items-center gap-2 px-4 py-3">
          <MessageSquare className="w-5 h-5 shrink-0" />
          <span className="text-sm font-medium hidden sm:inline">{t('chat.btn_label')}</span>
        </div>
      </button>
    </>
  )
}
