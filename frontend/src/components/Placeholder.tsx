import Sidebar from "@/components/Sidebar";

export default function Placeholder({ title }: { title: string }) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 bg-white p-8">
        <h1 className="text-[22px] font-bold tracking-tight text-stone-900">{title}</h1>
        <p className="mt-2 text-sm text-stone-500">Nothing here yet.</p>
      </main>
    </div>
  );
}
