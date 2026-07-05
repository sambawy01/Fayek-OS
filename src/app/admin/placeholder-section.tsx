/** A "coming soon" panel for tabs whose module lands in a later phase. */
export default function PlaceholderSection({
  title,
  blurb,
  bullets,
}: {
  title: string;
  blurb: string;
  bullets: string[];
}) {
  return (
    <section>
      <h2 className="font-serif text-2xl text-[#38492E]">{title}</h2>
      <p className="mt-1 text-sm text-[#5E6B4F]">{blurb}</p>
      <div className="mt-4 rounded-2xl border border-dashed border-[#38492E]/20 bg-[#FBF4E6]/60 px-6 py-6">
        <p className="text-sm font-medium text-[#38492E]">Coming soon</p>
        <ul className="mt-2 space-y-1.5 text-sm text-[#5E6B4F]">
          {bullets.map((b) => (
            <li key={b}>· {b}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}
