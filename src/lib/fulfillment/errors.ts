export class SelfPickupCollectionError extends Error {
  readonly status: 400 | 403 | 404 | 409;
  readonly code: string;
  readonly outstandingAmountPaise?: number;

  constructor(
    code: string,
    message: string,
    status: 400 | 403 | 404 | 409 = 409,
    outstandingAmountPaise?: number,
  ) {
    super(message);
    this.name = "SelfPickupCollectionError";
    this.code = code;
    this.status = status;
    this.outstandingAmountPaise = outstandingAmountPaise;
  }
}

export class FulfillmentSelectionError extends Error {
  readonly status = 400;
  readonly code = "INVALID_FULFILLMENT";

  constructor(message = "That fulfillment mode is not available for this restaurant.") {
    super(message);
    this.name = "FulfillmentSelectionError";
  }
}
