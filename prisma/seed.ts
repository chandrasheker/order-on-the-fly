import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { getDatabaseUrl } from "../src/lib/db-url";
import bcrypt from "bcryptjs";

const adapter = new PrismaBetterSqlite3({ url: getDatabaseUrl() });
const prisma = new PrismaClient({ adapter });

const menuData = [
  {
    name: "Beverages",
    slug: "beverages",
    icon: "🥤",
    sortOrder: 1,
    items: [
      { name: "Mineral Water", description: "Chilled 500ml bottle", price: 30, prepTimeMinutes: 1, isVeg: true, sortOrder: 1 },
      { name: "Fresh Lime Soda", description: "Sweet or salted", price: 60, prepTimeMinutes: 3, isVeg: true, sortOrder: 2 },
      { name: "Mango Lassi", description: "Thick & creamy", price: 80, prepTimeMinutes: 3, isVeg: true, sortOrder: 3 },
      { name: "Cold Coffee", description: "Blended with ice cream", price: 90, prepTimeMinutes: 4, isVeg: true, sortOrder: 4 },
    ],
  },
  {
    name: "Tea & Coffee",
    slug: "tea-coffee",
    icon: "☕",
    sortOrder: 2,
    items: [
      { name: "Masala Chai", description: "Spiced Indian tea", price: 40, prepTimeMinutes: 5, isVeg: true, sortOrder: 1 },
      { name: "Filter Coffee", description: "South Indian style", price: 50, prepTimeMinutes: 5, isVeg: true, sortOrder: 2 },
      { name: "Green Tea", description: "Light & refreshing", price: 45, prepTimeMinutes: 4, isVeg: true, sortOrder: 3 },
      { name: "Ginger Tea", description: "Warming & aromatic", price: 45, prepTimeMinutes: 5, isVeg: true, sortOrder: 4 },
    ],
  },
  {
    name: "Tiffins",
    slug: "tiffins",
    icon: "🥞",
    sortOrder: 3,
    items: [
      { name: "Plain Dosa", description: "Crispy rice crepe", price: 80, prepTimeMinutes: 10, isVeg: true, sortOrder: 1 },
      { name: "Masala Dosa", description: "Stuffed with potato masala", price: 120, prepTimeMinutes: 12, isVeg: true, sortOrder: 2 },
      { name: "Idli (2 pcs)", description: "Steamed rice cakes with chutney", price: 60, prepTimeMinutes: 8, isVeg: true, sortOrder: 3 },
      { name: "Medu Vada", description: "Crispy lentil donuts", price: 70, prepTimeMinutes: 10, isVeg: true, sortOrder: 4 },
      { name: "Pongal", description: "Comfort rice & lentil bowl", price: 90, prepTimeMinutes: 10, isVeg: true, sortOrder: 5 },
    ],
  },
  {
    name: "Snacks",
    slug: "snacks",
    icon: "🍟",
    sortOrder: 4,
    items: [
      { name: "Samosa (2 pcs)", description: "Crispy potato filled", price: 50, prepTimeMinutes: 5, isVeg: true, sortOrder: 1 },
      { name: "Pakora Platter", description: "Mixed vegetable fritters", price: 90, prepTimeMinutes: 8, isVeg: true, sortOrder: 2 },
      { name: "French Fries", description: "Golden & crispy", price: 100, prepTimeMinutes: 7, isVeg: true, sortOrder: 3 },
      { name: "Paneer Tikka", description: "Grilled cottage cheese", price: 180, prepTimeMinutes: 12, isVeg: true, sortOrder: 4 },
    ],
  },
  {
    name: "Lunch Specials",
    slug: "lunch",
    icon: "🍛",
    sortOrder: 5,
    items: [
      { name: "Veg Fried Rice", description: "Wok-tossed with veggies", price: 150, prepTimeMinutes: 12, isVeg: true, sortOrder: 1 },
      { name: "Chicken Fried Rice", description: "Classic Indo-Chinese", price: 200, prepTimeMinutes: 15, isVeg: false, sortOrder: 2 },
      { name: "Veg Thali", description: "Complete meal platter", price: 220, prepTimeMinutes: 15, isVeg: true, sortOrder: 3 },
      { name: "South Indian Meals", description: "Rice, sambar, rasam & more", price: 180, prepTimeMinutes: 12, isVeg: true, sortOrder: 4 },
    ],
  },
  {
    name: "Biryani & Mains",
    slug: "biryani",
    icon: "🍗",
    sortOrder: 6,
    items: [
      { name: "Veg Biryani", description: "Fragrant basmati with veggies", price: 180, prepTimeMinutes: 18, isVeg: true, sortOrder: 1 },
      { name: "Chicken Biryani", description: "Hyderabadi style dum biryani", price: 280, prepTimeMinutes: 20, isVeg: false, isSpicy: true, sortOrder: 2 },
      { name: "Mutton Biryani", description: "Slow-cooked tender mutton", price: 350, prepTimeMinutes: 25, isVeg: false, isSpicy: true, sortOrder: 3 },
      { name: "Butter Chicken", description: "Creamy tomato gravy", price: 320, prepTimeMinutes: 18, isVeg: false, sortOrder: 4 },
      { name: "Paneer Butter Masala", description: "Rich & creamy curry", price: 240, prepTimeMinutes: 15, isVeg: true, sortOrder: 5 },
    ],
  },
  {
    name: "Desserts",
    slug: "desserts",
    icon: "🍰",
    sortOrder: 7,
    items: [
      { name: "Gulab Jamun", description: "Warm milk dumplings", price: 60, prepTimeMinutes: 3, isVeg: true, sortOrder: 1 },
      { name: "Ice Cream Scoop", description: "Choice of flavors", price: 70, prepTimeMinutes: 2, isVeg: true, sortOrder: 2 },
      { name: "Payasam", description: "Traditional sweet pudding", price: 80, prepTimeMinutes: 4, isVeg: true, sortOrder: 3 },
    ],
  },
];

async function main() {
  await prisma.alert.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.menuItem.deleteMany();
  await prisma.menuCategory.deleteMany();
  await prisma.table.deleteMany();
  await prisma.user.deleteMany();
  await prisma.restaurant.deleteMany();

  const restaurant = await prisma.restaurant.create({
    data: {
      name: "Spice Garden Restaurant",
      slug: "spice-garden",
    },
  });

  const passwordHash = await bcrypt.hash("admin123", 10);

  await prisma.user.createMany({
    data: [
      { email: "owner@spicegarden.com", passwordHash, name: "Rajesh Kumar", role: "OWNER", restaurantId: restaurant.id },
      { email: "manager@spicegarden.com", passwordHash, name: "Priya Sharma", role: "MANAGER", restaurantId: restaurant.id },
      { email: "cook@spicegarden.com", passwordHash, name: "Chef Anand", role: "COOK", restaurantId: restaurant.id },
      { email: "server@spicegarden.com", passwordHash, name: "Arun Patel", role: "SERVER", restaurantId: restaurant.id },
    ],
  });

  for (let i = 1; i <= 10; i++) {
    await prisma.table.create({
      data: {
        number: i,
        restaurantId: restaurant.id,
      },
    });
  }

  for (const cat of menuData) {
    const category = await prisma.menuCategory.create({
      data: {
        name: cat.name,
        slug: cat.slug,
        icon: cat.icon,
        sortOrder: cat.sortOrder,
        restaurantId: restaurant.id,
      },
    });

    for (const item of cat.items) {
      await prisma.menuItem.create({
        data: {
          ...item,
          categoryId: category.id,
        },
      });
    }
  }

  console.log("✅ Database seeded!");
  console.log("🏪 Restaurant: Spice Garden (slug: spice-garden)");
  console.log("🔑 Staff login: owner@spicegarden.com / admin123");
  console.log("🪑 10 tables with QR codes ready");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
