"use client";

type Props = {
  imageUrl?: string | null;
};

export function CustomerPageBackground({ imageUrl }: Props) {
  if (!imageUrl) {
    return <div className="fixed inset-0 -z-20 bg-customer-shell" aria-hidden />;
  }

  return (
    <>
      <div
        className="fixed inset-0 -z-20 bg-cover bg-center bg-no-repeat scale-105"
        style={{ backgroundImage: `url(${imageUrl})` }}
        aria-hidden
      />
      <div
        className="fixed inset-0 -z-10 bg-gradient-to-b from-[color:var(--customer-overlay-from)] via-[color:var(--customer-overlay-via)] to-[color:var(--customer-overlay-to)] backdrop-blur-[1px]"
        aria-hidden
      />
    </>
  );
}
