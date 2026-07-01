/** Shared compact menu for multi-restaurant example configs */
module.exports.MINIMAL_DEMO_MENU = [
  {
    name: "Beverages",
    icon: "🥤",
    items: [
      { name: "Mineral Water", description: "500ml", price: 30, prepTimeMinutes: 1, isVeg: true },
      { name: "Fresh Lime Soda", description: "Sweet or salted", price: 60, prepTimeMinutes: 3, isVeg: true },
    ],
  },
  {
    name: "Mains",
    icon: "🍽️",
    items: [
      { name: "Chef Special Thali", description: "Daily combo", price: 220, prepTimeMinutes: 15, isVeg: true },
      { name: "Grilled Chicken", description: "House marinade", price: 280, prepTimeMinutes: 18, isVeg: false },
    ],
  },
];

module.exports.defaultStaffBlock = (domain, defaultPassword, slug) => {
  const emailDomain = slug ? `${slug}.local` : domain.replace(/^\.*/, "") || "local";
  return {
    domain: emailDomain,
    defaultPassword,
    owners: [{ name: "Owner", email: `owner@${emailDomain}` }],
    managers: [{ name: "Manager One", email: `manager1@${emailDomain}` }],
    cooks: [
      { name: "Head Chef", email: `cook1@${emailDomain}` },
      { name: "Cook Two", email: `cook2@${emailDomain}` },
    ],
    servers: [
      { name: "Server One", email: `server1@${emailDomain}` },
      { name: "Server Two", email: `server2@${emailDomain}` },
    ],
  };
};
