"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Star, X, MessageSquare } from "lucide-react";
import { Button, Input } from "@/components/ui";

export function FeedbackButton({
  tableToken,
  customerName,
  orderId,
}: {
  tableToken: string;
  customerName?: string;
  orderId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [stars, setStars] = useState(0);
  const [hover, setHover] = useState(0);
  const [message, setMessage] = useState("");
  const [name, setName] = useState(customerName || "");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async () => {
    if (stars < 1) return;
    setSubmitting(true);
    const res = await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tableToken,
        stars,
        message,
        customerName: name,
        orderId,
      }),
    });
    setSubmitting(false);
    if (res.ok) {
      setDone(true);
      setTimeout(() => {
        setOpen(false);
        setDone(false);
        setStars(0);
        setMessage("");
      }, 2000);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-24 right-4 z-40 w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 shadow-lg shadow-purple-500/30 flex items-center justify-center text-white active:scale-95 transition-transform"
        aria-label="Leave feedback"
      >
        <MessageSquare className="w-5 h-5" />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          >
            <motion.div
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              className="w-full max-w-sm rounded-2xl bg-[#1a1a2e] border border-white/10 p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold">How was your experience?</h3>
                <button type="button" onClick={() => setOpen(false)}>
                  <X className="w-5 h-5 text-zinc-400" />
                </button>
              </div>

              {done ? (
                <p className="text-center text-emerald-400 py-8">Thank you for your feedback! 🙏</p>
              ) : (
                <>
                  <div className="flex justify-center gap-2 mb-4">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <button
                        key={s}
                        type="button"
                        onMouseEnter={() => setHover(s)}
                        onMouseLeave={() => setHover(0)}
                        onClick={() => setStars(s)}
                        className="p-1"
                      >
                        <Star
                          className={`w-8 h-8 transition-colors ${
                            s <= (hover || stars)
                              ? "fill-amber-400 text-amber-400"
                              : "text-zinc-600"
                          }`}
                        />
                      </button>
                    ))}
                  </div>

                  {!customerName && (
                    <Input
                      placeholder="Your name (optional)"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="mb-3"
                    />
                  )}

                  <textarea
                    placeholder="Tell us more... (optional)"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={3}
                    className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-purple-500/50 mb-4 resize-none"
                  />

                  <Button
                    onClick={submit}
                    disabled={stars < 1 || submitting}
                    className="w-full"
                  >
                    {submitting ? "Sending..." : "Submit Feedback"}
                  </Button>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
