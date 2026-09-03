-- Webhook replay identity is per restaurant. Two merchants may share a provider
-- externalId; events must never collide or replay across restaurant boundaries.
DROP INDEX "PaymentWebhookEvent_provider_externalId_key";
CREATE UNIQUE INDEX "PaymentWebhookEvent_restaurantId_provider_externalId_key" ON "PaymentWebhookEvent"("restaurantId", "provider", "externalId");
