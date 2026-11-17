'use client';

import { useEffect } from 'react';
import { APP_META } from '@/lib/appMeta';

const AMW_ASCII = [
  ' █████╗ ███╗   ███╗██╗    ██╗',
  '██╔══██╗████╗ ████║██║    ██║',
  '███████║██╔████╔██║██║ █╗ ██║',
  '██╔══██║██║╚██╔╝██║██║███╗██║',
  '██║  ██║██║ ╚═╝ ██║╚███╔███╔╝',
  '╚═╝  ╚═╝╚═╝     ╚═╝ ╚══╝╚══╝ ',
].join('\n');

export function ConsoleBanner() {
  useEffect(() => {
    const win = window as unknown as { __amwConsoleBannerShown?: boolean };
    if (win.__amwConsoleBannerShown) return;
    win.__amwConsoleBannerShown = true;

    console.log(
      `%c${AMW_ASCII}`,
      'color: #e2e8f0; font-family: monospace; font-size: 13px; font-weight: 800; line-height: 1.05; text-shadow: -1.5px 0 #06b6d4, 1.5px 0 #ef4444;',
    );
    console.log(
      `%cHold Up!\n%cIf someone told you to copy and paste something here to unlock a feature or bypass permissions, it is a scam and could give them access to your account.\n%c(พื้นที่นี้สำหรับผู้ดูแลระบบและนักพัฒนาเท่านั้น ห้ามวางโค้ดใดๆ ตามคำแนะนำของผู้อื่น)\n\n%cAUTOMOTIONWORKS • ${APP_META.shortName} ${APP_META.version}\n%cDeveloped by A$ap`,
      'color: #f59e0b; font-size: 22px; font-weight: 900; line-height: 1.4;',
      'color: #e2e8f0; font-size: 13px; line-height: 1.55;',
      'color: #94a3b8; font-size: 12px; line-height: 1.5;',
      'color: #38bdf8; font-size: 12px; font-weight: 700;',
      'color: #34d399; font-size: 12px; font-weight: 700;',
    );
  }, []);

  return null;
}
