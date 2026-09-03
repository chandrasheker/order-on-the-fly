# Razorpay sandbox smoke (optional)

Normal `npm test` / `npm run build` do **not** call Razorpay.

To run a manual TEST-mode smoke:

1. Set restaurant credentials in Admin → Realtime → Payments (never commit them):
   - Key ID
   - Key secret
   - Webhook secret
2. Webhook URL is shown on that page as `/api/webhooks/payment/<slug>?provider=razorpay`.
3. On a restaurant host (`<slug>.dvadtech.in` or `<slug>.localhost`):
   - Serve one unpaid order
   - Confirm the customer due matches the staff bill
   - Open Razorpay Checkout and complete a test payment
   - Confirm callback + webhook produce **one** captured Payment and **one** finalized Bill
   - Open `/receipt/<publicToken>`
   - Replay the webhook and confirm no second Payment
   - Issue a partial refund from staff and confirm one local refund row

Environment variables used by the app for encryption (not Razorpay itself):

- `TABLETAP_CREDENTIALS_KEY` or `JWT_SECRET` — encrypts gateway secrets at rest
