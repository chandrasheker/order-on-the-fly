import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { CompanyHeader } from "@/components/marketing/company/CompanyHeader";
import { MarketingBodyClass } from "@/components/marketing/MarketingBodyClass";

const PROBLEMS = [
  {
    title: "Operational friction",
    body: "Work piles up in gaps between people, paper, and software. Staff spend the rush on coordination instead of service.",
  },
  {
    title: "Disconnected workflows",
    body: "Orders, kitchen status, payments, and pickup live in different places. Everyone asks the same questions because the floor cannot see one picture.",
  },
  {
    title: "Waiting as a default",
    body: "Customers wait to order, wait to add something, wait for the bill. Those waits are usually process, not hospitality.",
  },
  {
    title: "Intelligence only where it helps",
    body: "We use automation and AI when it removes a real step — not as decoration, and not as a substitute for operators who know the business.",
  },
];

const STEPS = [
  { label: "Problem", text: "Start with the operational failure, not a technology preference." },
  { label: "Workflow", text: "Watch how the work actually moves across people, counters, and devices." },
  { label: "Engineer", text: "Build a product that staff and customers can use under pressure." },
  { label: "Intelligence", text: "Add automation only where it measurably reduces error or delay." },
  { label: "Measure", text: "Judge the result by operational value: fewer waits, fewer re-entries, clearer state." },
];

export function DvadtechHomePage() {
  const contact = (process.env.NEXT_PUBLIC_DVADTECH_CONTACT_URL ?? "").trim();

  return (
    <div id="top" className="marketing-dvad min-h-screen bg-[#07080d] text-zinc-200">
      <MarketingBodyClass className="marketing-site" />
      <CompanyHeader />

      <main>
        <section className="relative overflow-hidden">
          <div className="pointer-events-none absolute inset-0" aria-hidden>
            <div className="absolute -top-24 left-1/4 h-80 w-80 rounded-full bg-sky-500/10 blur-3xl" />
            <div className="absolute bottom-0 right-0 h-96 w-96 rounded-full bg-indigo-500/10 blur-3xl" />
          </div>
          <div className="relative mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28 lg:py-32">
            <p className="text-xs uppercase tracking-[0.22em] text-sky-300/80">DVADTech</p>
            <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-5xl lg:text-6xl">
              Technology built around real problems.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-zinc-400">
              DVADTech creates practical software and AI-integrated products that simplify operations,
              improve customer experience, and turn complex workflows into tools people can actually run.
            </p>
            <div className="mt-10 flex flex-col gap-3 sm:flex-row">
              <a
                href="#products"
                className="inline-flex items-center justify-center rounded-full bg-white px-5 py-2.5 text-sm font-medium text-zinc-950"
              >
                See products
              </a>
              <Link
                href="/oof"
                className="inline-flex items-center justify-center rounded-full border border-white/15 px-5 py-2.5 text-sm font-medium text-white hover:bg-white/5"
              >
                Explore Order-on-the-Fly
                <ArrowRight className="ml-2 size-4" />
              </Link>
            </div>
          </div>
        </section>

        <section id="solve" className="border-t border-white/8">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
            <h2 className="text-2xl font-semibold text-white sm:text-3xl">Problems first. Products second.</h2>
            <p className="mt-3 max-w-2xl text-zinc-400">
              Physical businesses still lose time to waiting, re-entry, and fragmented status. We build
              software for those seams — the places where the customer is standing and the staff are already busy.
            </p>
            <div className="mt-10 grid gap-4 sm:grid-cols-2">
              {PROBLEMS.map((item) => (
                <article key={item.title} className="rounded-2xl border border-white/8 bg-white/[0.03] p-6">
                  <h3 className="text-base font-medium text-white">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-400">{item.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="products" className="border-t border-white/8">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
            <h2 className="text-2xl font-semibold text-white sm:text-3xl">Products</h2>
            <p className="mt-3 max-w-2xl text-zinc-400">
              Each product is built around a measurable operational problem. More DVADTech products will
              appear here as they are ready — we do not list vapourware.
            </p>
            <div className="mt-10 grid gap-5 lg:grid-cols-2">
              <article className="flex flex-col rounded-3xl border border-orange-400/20 bg-gradient-to-br from-orange-500/10 to-transparent p-7">
                <p className="text-xs uppercase tracking-[0.18em] text-orange-300">Available for pilots</p>
                <h3 className="mt-3 text-2xl font-semibold text-white">Order-on-the-Fly</h3>
                <p className="mt-1 text-sm text-orange-100/70">TableTap by DVADTech</p>
                <p className="mt-4 flex-1 text-sm leading-relaxed text-zinc-300">
                  Restaurant ordering and operations: QR menus, kitchen coordination, payments, collection
                  gating, printing, and multi-outlet command — designed so a full room does not mean a waiting room.
                </p>
                <Link
                  href="/oof"
                  className="mt-6 inline-flex items-center text-sm font-medium text-orange-200 hover:text-white"
                >
                  Explore Order-on-the-Fly
                  <ArrowRight className="ml-2 size-4" />
                </Link>
              </article>
              <article className="flex flex-col rounded-3xl border border-white/8 bg-white/[0.03] p-7">
                <p className="text-xs uppercase tracking-[0.18em] text-sky-300/80">In development</p>
                <h3 className="mt-3 text-2xl font-semibold text-white">AREP</h3>
                <p className="mt-1 text-sm text-zinc-500">AI Retail Experience Platform</p>
                <p className="mt-4 flex-1 text-sm leading-relaxed text-zinc-400">
                  An AI-assisted physical retail experience: helping customers understand products, interact
                  in-store, and try ideas such as virtual try-on — without pretending the shelf is a website.
                  AREP is not commercially available yet.
                </p>
                <p className="mt-6 text-sm text-zinc-500">Updates will be published here when the product is ready.</p>
              </article>
            </div>
          </div>
        </section>

        <section id="approach" className="border-t border-white/8">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
            <h2 className="text-2xl font-semibold text-white sm:text-3xl">How DVADTech works</h2>
            <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {STEPS.map((step, index) => (
                <li key={step.label} className="rounded-2xl border border-white/8 p-4">
                  <p className="text-xs text-zinc-500">{String(index + 1).padStart(2, "0")}</p>
                  <h3 className="mt-2 font-medium text-white">{step.label}</h3>
                  <p className="mt-2 text-sm text-zinc-400 leading-relaxed">{step.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="about" className="border-t border-white/8">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
            <h2 className="text-2xl font-semibold text-white sm:text-3xl">About</h2>
            <p className="mt-4 max-w-3xl text-zinc-400 leading-relaxed">
              DVADTech is a product company. We care about reliable software, clear operational state, and
              customer experience in the physical world. We do not sell generic “AI transformation.” We ship
              products that have to work on a busy floor.
            </p>
          </div>
        </section>

        <section id="explore" className="border-t border-white/8">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <div className="rounded-3xl border border-white/10 bg-white/[0.03] px-6 py-10 sm:px-10">
              <h2 className="text-2xl font-semibold text-white">See the first product.</h2>
              <p className="mt-3 max-w-xl text-zinc-400">
                Order-on-the-Fly is the restaurant system we built to remove unnecessary waiting without
                removing hospitality.
              </p>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/oof"
                  className="inline-flex items-center justify-center rounded-full bg-white px-5 py-2.5 text-sm font-medium text-zinc-950"
                >
                  Explore Order-on-the-Fly
                </Link>
                {contact ? (
                  <a
                    href={contact}
                    className="inline-flex items-center justify-center rounded-full border border-white/15 px-5 py-2.5 text-sm font-medium text-white"
                  >
                    Contact
                  </a>
                ) : null}
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/8">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-zinc-500 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>© {new Date().getFullYear()} DVADTech</p>
          <nav className="flex flex-wrap gap-4" aria-label="Footer">
            <a href="#top" className="hover:text-white">
              Home
            </a>
            <Link href="/oof" className="hover:text-white">
              Order-on-the-Fly
            </Link>
            <a href="#products" className="hover:text-white">
              Products
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
