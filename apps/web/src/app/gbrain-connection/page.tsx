import { GbrainConnectionPanel } from "@/components/gbrain-connection-panel";

export default function GbrainConnectionPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-5 py-10">
      <p className="mb-6 font-display text-muted text-sm tracking-wide">
        gbrain-sandbox
      </p>
      <GbrainConnectionPanel />
    </main>
  );
}
