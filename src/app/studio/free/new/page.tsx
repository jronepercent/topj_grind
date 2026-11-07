import { PageHeader } from "@/components/studio/ui";
import { FreebieEditor } from "@/components/studio/freebie-editor";

export const metadata = { title: "ของฟรีชิ้นใหม่" };

export default function NewFreebiePage() {
  return (
    <div>
      <PageHeader title="ของฟรีชิ้นใหม่" />
      <FreebieEditor claims={[]} />
    </div>
  );
}
