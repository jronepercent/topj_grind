import "server-only";
import { FlaskConical } from "lucide-react";
import { isDemoMode } from "@/lib/server/auth";
import { DEMO_ACCOUNTS, demoPassword } from "@/lib/server/demo-accounts";

const LABEL: Record<keyof typeof DEMO_ACCOUNTS, string> = {
  admin: "Admin (JR)",
  member: "สมาชิก",
  expiring: "สมาชิกใกล้หมดอายุ",
  free: "ฟรี (ยังไม่สมัคร)",
};

/** Demo mode only: lists the sample accounts so reviewers can sign in quickly. */
export function DemoAccounts() {
  const DEMO_PASSWORD = demoPassword();
  if (!isDemoMode() || !DEMO_PASSWORD) return null;
  const rows = Object.entries(DEMO_ACCOUNTS) as [keyof typeof DEMO_ACCOUNTS, string][];
  return (
    <aside className="mt-4 rounded-[16px] border border-dashed border-border-strong px-4 py-3.5" aria-label="บัญชีทดลอง (โหมดเดโม)">
      <p className="t-caption flex items-center gap-1.5 font-semibold text-text-2">
        <FlaskConical className="size-3.5" strokeWidth={1.75} aria-hidden /> โหมดเดโม · บัญชีทดลอง
      </p>
      <dl className="mt-2 space-y-1 text-[13px]">
        {rows.map(([k, email]) => (
          <div key={k} className="flex flex-wrap items-baseline justify-between gap-x-3">
            <dt className="text-text-2">{LABEL[k]}</dt>
            <dd className="select-all font-mono text-[12px]">{email}</dd>
          </div>
        ))}
      </dl>
      <p className="t-caption mt-2 text-text-2">
        รหัสผ่านทุกบัญชี: <span className="select-all font-mono text-text">{DEMO_PASSWORD}</span>
      </p>
    </aside>
  );
}
