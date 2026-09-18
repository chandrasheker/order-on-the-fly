import Link from "next/link";
import { Check, QrCode, UtensilsCrossed, Wallet } from "lucide-react";
import { MarketingBodyClass } from "@/components/marketing/MarketingBodyClass";
import { BrowserFrame, PhoneFrame } from "@/components/marketing/ProductFrames";
import { OofHeader } from "@/components/marketing/oof/OofHeader";
import { OofHero } from "@/components/marketing/oof/OofHero";
import { OofProductStory } from "@/components/marketing/oof/OofProductStory";

const PAIRS = [
  {
    pain: "Waiting to place an order",
    fix: "The table QR opens a live menu. Guests order when they are ready.",
  },
  {
    pain: "Waiters overloaded in the rush",
    fix: "Guests can self-order when it fits the service style. Staff stay on hospitality, not queueing.",
  },
  {
    pain: "Orders rewritten or remembered",
    fix: "The ticket travels digitally into the operational workflow. No second pad.",
  },
  {
    pain: "A second item means waiting again",
    fix: "The same session can add more. Nobody needs to catch a waiter for another lime soda.",
  },
  {
    pain: "Kitchen cannot see what is coming",
    fix: "Live kitchen and order state — preparing, ready, delayed — on one floor picture.",
  },
  {
    pain: "Waiting for the bill and payment",
    fix: "Payment is part of the table workflow, not a separate chase at the end.",
  },
  {
    pain: "Food handed over before money is settled",
    fix: "For self-service, ready + verified payment is required before collection. Outstanding balance blocks handover.",
  },
  {
    pain: "One product forced onto every service style",
    fix: "Full service, self-service, or hybrid — the restaurant chooses how much the guest does.",
  },
  {
    pain: "Several outlets, no shared picture",
    fix: "A group can see Madhapur, Kondapur, and Gachibowli without standing at each counter.",
  },
  {
    pain: "KOT / print falling behind the ticket",
    fix: "Print is part of the operational path, not a hope that the printer heard the order.",
  },
];

const BEFORE = [
  "Searching for a waiter",
  "Staff carrying too many simultaneous jobs",
  "Repeated order taking",
  "Kitchen communication by shout and memory",
  "Payment as a second wait",
  "Nobody sure which table is actually ready",
];

const AFTER = ["Scan", "Order", "Kitchen receives", "Preparing", "Ready", "Paid", "Served / collected"];

const CAPABILITIES = [
  {
    title: "Guest experience",
    items: ["QR table entry", "Live menu", "Order more without waiting", "Visible prep / ready state"],
  },
  {
    title: "Restaurant service",
    items: ["Full service, self-service, or hybrid", "Table state on the floor", "Staff still run hospitality"],
  },
  {
    title: "Kitchen operations",
    items: ["Incoming tickets", "Preparation progress", "Ready signalling"],
  },
  {
    title: "Payments",
    items: ["In-flow payment", "Outstanding balance is visible", "No ‘maybe they paid’ handover"],
  },
  {
    title: "Self-service pickup",
    items: ["Food-ready gating", "Payment-required collection", "Handover blocked if money is due"],
  },
  {
    title: "Printing",
    items: ["Kitchen tickets in the operational path", "Reprint when the floor needs it"],
  },
  {
    title: "Management",
    items: ["Orders, payments, QR/tables, reports", "Activity without standing at the counter"],
  },
  {
    title: "Multi-outlet",
    items: ["ABC Group → Madhapur, Kondapur, Gachibowli", "One command picture across outlets"],
  },
];

export function OofLandingPage() {
  const contact = (process.env.NEXT_PUBLIC_DVADTECH_CONTACT_URL ?? "").trim();

  return (
    <div className="marketing-oof min-h-screen bg-[#140c08] text-orange-50">
      <MarketingBodyClass className="marketing-site" />
      <OofHeader />
      <main>
        <OofHero />

        <section className="border-t border-orange-500/15">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <h2 className="text-2xl font-semibold text-white sm:text-3xl">The night you already know</h2>
            <div className="mt-8 grid gap-4 lg:grid-cols-2">
              <article className="rounded-3xl border border-white/10 bg-black/25 p-6">
                <p className="text-xs uppercase tracking-[0.18em] text-zinc-400">Current restaurant</p>
                <ol className="mt-4 space-y-2 text-sm text-zinc-300">
                  {[
                    "Customer arrives",
                    "Waits for a menu / someone to order",
                    "Tries to find a waiter",
                    "Waiter is covering many tables",
                    "Order is written, remembered, or re-entered",
                    "Kitchen coordination by interruption",
                    "Customer wants another item — waits again",
                    "Asks for the bill — waits for payment",
                  ].map((line) => (
                    <li key={line} className="border-l border-white/10 pl-3">
                      {line}
                    </li>
                  ))}
                </ol>
              </article>
              <article className="rounded-3xl border border-orange-400/25 bg-orange-500/10 p-6">
                <p className="text-xs uppercase tracking-[0.18em] text-orange-200">With Order-on-the-Fly</p>
                <ol className="mt-4 space-y-2 text-sm text-orange-50/90">
                  {[
                    "Customer sits",
                    "Scans the table QR",
                    "Sees the live menu",
                    "Orders",
                    "Kitchen and staff see it",
                    "Preparation status moves",
                    "They can order more",
                    "Payment → collection / table service → done",
                  ].map((line) => (
                    <li key={line} className="border-l border-orange-300/40 pl-3">
                      {line}
                    </li>
                  ))}
                </ol>
              </article>
            </div>
          </div>
        </section>

        <section id="story" className="border-t border-orange-500/15">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <h2 className="text-2xl font-semibold text-white sm:text-3xl">A short product story</h2>
            <p className="mt-3 max-w-2xl text-sm text-orange-50/70">
              Illustrated scenes of the floor story — not stock footage of a customer we do not have. A real
              restaurant film can replace this later without redesigning the page.
            </p>
            <div className="mt-8">
              <OofProductStory />
            </div>
          </div>
        </section>

        <section className="border-t border-orange-500/15">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <h2 className="text-2xl font-semibold text-white sm:text-3xl">Pain, mapped to the product</h2>
            <div className="mt-8 grid gap-3">
              {PAIRS.map((row) => (
                <div
                  key={row.pain}
                  className="grid gap-2 rounded-2xl border border-white/10 bg-black/20 p-4 sm:grid-cols-2 sm:gap-6"
                >
                  <p className="text-sm text-zinc-400">{row.pain}</p>
                  <p className="text-sm text-orange-50">{row.fix}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-orange-500/15">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <h2 className="text-2xl font-semibold text-white sm:text-3xl">Before / after on the floor</h2>
            <div className="mt-8 grid gap-6 lg:grid-cols-2">
              <div className="rounded-3xl border border-white/10 p-6">
                <p className="text-xs uppercase tracking-[0.18em] text-zinc-500">Before</p>
                <ul className="mt-4 space-y-2 text-sm text-zinc-400">
                  {BEFORE.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <div className="rounded-3xl border border-orange-400/30 bg-orange-500/10 p-6">
                <p className="text-xs uppercase tracking-[0.18em] text-orange-200">After</p>
                <ol className="mt-4 flex flex-wrap gap-2">
                  {AFTER.map((item) => (
                    <li
                      key={item}
                      className="rounded-full border border-orange-300/30 bg-black/20 px-3 py-1 text-sm text-white"
                    >
                      {item}
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </div>
        </section>

        <section className="border-t border-orange-500/15">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <h2 className="text-2xl font-semibold text-white sm:text-3xl">The guest phone, the live menu</h2>
            <p className="mt-3 max-w-2xl text-sm text-orange-50/70">
              These are real product screens — not mockups. Captions describe the business job, not the UI chrome.
            </p>
            <div className="mt-10 grid items-end gap-10 md:grid-cols-3">
              <PhoneFrame
                src="/marketing/oof/01-customer-checkin.png"
                alt="Guest table check-in on a phone"
                width={860}
                height={1864}
                caption="Sit down. The table is the door. No extra app hunt."
                priority
              />
              <PhoneFrame
                src="/marketing/oof/02-customer-menu.png"
                alt="Live customer menu on a phone"
                width={860}
                height={1864}
                caption="What they can order is what they see."
              />
              <PhoneFrame
                src="/marketing/oof/03-customer-menu-scroll.png"
                alt="Customer browsing more of the live menu"
                width={860}
                height={1864}
                caption="A longer menu still has to work in one hand, in a noisy room."
              />
            </div>
          </div>
        </section>

        <section id="ops" className="border-t border-orange-500/15">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <h2 className="text-2xl font-semibold text-white sm:text-3xl">Know what is happening without standing at the counter</h2>
            <p className="mt-3 max-w-2xl text-sm text-orange-50/70">
              Orders, payments, ready tickets, kitchen state, QR tables, and reports — the same night, not a
              spreadsheet the next morning.
            </p>
            <div className="mt-10 grid gap-8 lg:grid-cols-2">
              <BrowserFrame
                src="/marketing/oof/04-staff-dashboard.png"
                alt="Staff dashboard showing live restaurant activity"
                width={1440}
                height={900}
                caption="Live restaurant activity: what is open, what is waiting, what needs a person."
                priority
              />
              <BrowserFrame
                src="/marketing/oof/05-table-ordering-panel.png"
                alt="Table ordering panel used by staff"
                width={1280}
                height={570}
                caption="A table is a working object — not a memory of who asked for what."
              />
              <BrowserFrame
                src="/marketing/oof/06-pending-payments.png"
                alt="Pending payments list"
                width={1440}
                height={900}
                caption="Outstanding money is visible before food leaves the counter."
              />
              <BrowserFrame
                src="/marketing/oof/09-admin-reports.png"
                alt="Restaurant reports"
                width={1440}
                height={900}
                caption="End of night, you still need numbers you can trust."
              />
            </div>
            <div className="mt-8 grid gap-8 md:grid-cols-2">
              <BrowserFrame
                src="/marketing/oof/07-admin-qr-codes.png"
                alt="QR and table management"
                width={1440}
                height={900}
                caption="Tables and QR codes are operational inventory. Reprint when the hostname or table changes."
              />
              <BrowserFrame
                src="/marketing/oof/08-admin-menu.png"
                alt="Menu management"
                width={1440}
                height={900}
                caption="The live menu guests see is the menu you are actually running."
              />
            </div>
            <div className="mt-10 grid items-center gap-8 md:grid-cols-[16rem_1fr]">
              <PhoneFrame
                src="/marketing/oof/10-staff-login.png"
                alt="Staff login on a restaurant host"
                width={860}
                height={1864}
                caption="Staff sign-in stays on the restaurant host — not on the company website."
              />
              <p className="text-sm leading-relaxed text-zinc-400">
                dvadtech.in is the company site. The restaurant host is the floor. Mixing those two would leak
                control-plane UI onto customer links. We keep them apart on purpose.
              </p>
            </div>
            <div className="mt-10 rounded-3xl border border-white/10 bg-black/20 p-6 sm:p-8">
              <p className="text-xs uppercase tracking-[0.18em] text-orange-200/80">Several outlets</p>
              <h3 className="mt-2 text-xl font-semibold text-white">ABC Group</h3>
              <ul className="mt-4 flex flex-col gap-2 text-sm text-orange-50/80 sm:flex-row sm:flex-wrap sm:gap-4">
                <li className="rounded-full border border-white/10 px-3 py-1">ABC Madhapur</li>
                <li className="rounded-full border border-white/10 px-3 py-1">ABC Kondapur</li>
                <li className="rounded-full border border-white/10 px-3 py-1">ABC Gachibowli</li>
              </ul>
              <p className="mt-4 max-w-2xl text-sm text-zinc-400">
                One group. Distinct restaurant hosts. The command picture is for owners and managers — not a
                lecture about tenancy.
              </p>
            </div>
          </div>
        </section>

        <section id="service" className="border-t border-orange-500/15">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <h2 className="text-2xl font-semibold text-white sm:text-3xl">TableTap doesn&apos;t remove hospitality. It removes unnecessary waiting.</h2>
            <div className="mt-8 grid gap-4 lg:grid-cols-3">
              <article className="rounded-3xl border border-white/10 p-6">
                <UtensilsCrossed className="size-5 text-orange-300" />
                <h3 className="mt-3 font-medium text-white">Full service</h3>
                <p className="mt-2 text-sm text-zinc-400">Customer → waiter / service flow → kitchen. Staff still own the table.</p>
              </article>
              <article className="rounded-3xl border border-orange-400/25 bg-orange-500/10 p-6">
                <QrCode className="size-5 text-orange-200" />
                <h3 className="mt-3 font-medium text-white">Self service</h3>
                <p className="mt-2 text-sm text-zinc-400">
                  Customer → TableTap → kitchen → payment → collection. Ready food is not handed over while money is still due.
                </p>
              </article>
              <article className="rounded-3xl border border-white/10 p-6">
                <Wallet className="size-5 text-orange-300" />
                <h3 className="mt-3 font-medium text-white">Hybrid</h3>
                <p className="mt-2 text-sm text-zinc-400">
                  Combine staff service and guest self-ordering. The restaurant chooses the mix; the product does not lecture.
                </p>
              </article>
            </div>
          </div>
        </section>

        <section className="border-t border-orange-500/15">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <h2 className="text-2xl font-semibold text-white sm:text-3xl">Ready for collection means paid — when you run self-service</h2>
            <div className="mt-6 rounded-3xl border border-orange-400/25 bg-black/30 p-6 sm:p-8">
              <p className="text-lg text-white">Food ready + payment verified = ready for collection.</p>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-orange-50/75">
                If money is still outstanding, handover stays blocked. That is a restaurant control, not a
                slogan. Staff are not asked to remember who looks like they paid.
              </p>
            </div>
          </div>
        </section>

        <section id="capabilities" className="border-t border-orange-500/15">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <h2 className="text-2xl font-semibold text-white sm:text-3xl">What the product actually covers</h2>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {CAPABILITIES.map((group) => (
                <article key={group.title} className="rounded-2xl border border-white/10 p-4">
                  <h3 className="text-sm font-medium text-white">{group.title}</h3>
                  <ul className="mt-3 space-y-1.5 text-sm text-zinc-400">
                    {group.items.map((item) => (
                      <li key={item} className="flex gap-2">
                        <Check className="mt-0.5 size-3.5 shrink-0 text-orange-300" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="pilot" className="border-t border-orange-500/15">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <div className="rounded-3xl border border-orange-400/30 bg-gradient-to-br from-orange-500/20 to-transparent px-6 py-10 sm:px-10">
              <h2 className="text-2xl font-semibold text-white">Run it on a real floor.</h2>
              <p className="mt-3 max-w-xl text-sm text-orange-50/75">
                We do not invent customer counts or percentage lifts. A pilot is how you see whether the waiting
                loop actually shortens in your service style.
              </p>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                {contact ? (
                  <>
                    <a
                      href={contact}
                      className="inline-flex items-center justify-center rounded-full bg-orange-500 px-5 py-2.5 text-sm font-medium text-zinc-950"
                    >
                      Start a Pilot
                    </a>
                    <a
                      href={contact}
                      className="inline-flex items-center justify-center rounded-full border border-white/20 px-5 py-2.5 text-sm font-medium text-white"
                    >
                      Book a Live Demo
                    </a>
                  </>
                ) : (
                  <p className="max-w-xl text-sm text-orange-50/80">
                    Start a pilot or book a live demo through your DVADTech contact. Platform operators can sign
                    in below.
                  </p>
                )}
                <Link
                  href="/oof/platform/login"
                  className="inline-flex items-center justify-center rounded-full border border-white/15 px-5 py-2.5 text-sm font-medium text-white"
                >
                  Platform Login
                </Link>
                <Link href="/" className="inline-flex items-center justify-center px-2 py-2.5 text-sm text-orange-200">
                  DVADTech home
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>
      <footer className="border-t border-orange-500/15">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-sm text-zinc-500 sm:flex-row sm:justify-between sm:px-6">
          <p>Order-on-the-Fly · TableTap by DVADTech</p>
          <nav className="flex flex-wrap gap-4">
            <Link href="/" className="hover:text-white">
              DVADTech
            </Link>
            <a href="#story" className="hover:text-white">
              How it works
            </a>
            <Link href="/oof/platform/login" className="hover:text-white">
              Platform Login
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
