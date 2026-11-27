/** Khung trang chức năng. Chưa nối dữ liệu. */
export function FeaturePage({ title, about }: { title: string; about: string }) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-5 py-8">
        <h1 className="m-0 text-[22px] leading-7 font-semibold tracking-tight">{title}</h1>
        <p className="m-0 text-muted-foreground">{about}</p>
        <div className="border border-dashed px-3 py-6 text-center text-muted-foreground">
          Trang này chưa nối dữ liệu.
        </div>
      </div>
    </div>
  )
}
