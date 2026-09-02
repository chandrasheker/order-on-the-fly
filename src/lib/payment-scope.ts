export function paymentOwnedByRestaurant<T extends { restaurantId: string }>(
  restaurantId: string | null | undefined,
  payment: T | null | undefined,
): T | null {
  if (!restaurantId || !payment) return null;
  if (payment.restaurantId !== restaurantId) return null;
  return payment;
}

export function printJobOwnedByRestaurant<T extends { restaurantId: string }>(
  restaurantId: string | null | undefined,
  job: T | null | undefined,
): T | null {
  if (!restaurantId || !job) return null;
  if (job.restaurantId !== restaurantId) return null;
  return job;
}

export function billOwnedByRestaurant<T extends { restaurantId: string }>(
  restaurantId: string | null | undefined,
  bill: T | null | undefined,
): T | null {
  if (!restaurantId || !bill) return null;
  if (bill.restaurantId !== restaurantId) return null;
  return bill;
}
